const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");
const Discord = require('discord.js');
const {
    getColorFromCommand,
    shuffleArray,
    getRandomFromArray
} = require("./common.js");

const VIDEO_MAX_DURATION = 60 * 60 * 5; // 5h in seconds
const MAX_VIEW_SONG_LIST = 10; // Maximes cançons a mostrar a la llista | ASSERT MAX_VIEW_SONG_LIST != 0
const DISCONNECTION_DELAY_SECONDS = 120; // Temps d'espera en desconnectar-se en segons
const TYPE = "musica";
const PLAYLIST_PATTERN = /^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/i;

const queue = new Map();

async function cercar_video(args, message) {

    let song = {};

    if (ytdl.validateURL(args[0])) {
        const song_info = await ytdl.getInfo(args[0]);

        if (song_info.videoDetails.isLiveContent) {
            message.channel.send("**❌ Error: No es poden posar transmissions en directe! Prova millor amb un video.**");
            return;
        }

        if (song_info.videoDetails.isPrivate) {
            message.channel.send("**❌ Error: El video és privat!**");
            return;
        }

        song = {
            title: song_info.videoDetails.title,
            url: song_info.videoDetails.video_url,
            duration: parseInt(song_info.videoDetails.lengthSeconds),
            channel: song_info.videoDetails.ownerChannelName,
            thumbnail: song_info.videoDetails.thumbnails[song_info.videoDetails.thumbnails.length - 1].url,
            requestedBy: message.author
        };
    } else {
        const video_finder = async (query) => {
            try {
                const video_result = await ytSearch({
                    search: query,
                    category: 'music',
                    pages: 1
                });
                return video_result.videos.length > 1 ? video_result.videos[0] : null;
            } catch (err) {
                console.error(err);
                enviarError(message, "Error al cercar la cançó", err, "Al cercar video");
                return null;
            }
        };

        const video = await video_finder(args.join(" "));

        if (video) {
            song = {
                title: video.title,
                url: video.url,
                duration: video.seconds,
                channel: video.author.name,
                thumbnail: video.thumbnail,
                requestedBy: message.author
            };
        } else {
            message.channel.send("**❌ Error: Ho sento, no he trobat cap vídeo. 😦**");
            return;
        }
    }

    return song;

}

function queue_constructor_generic(voice_channel, message) {
    return {
        voice_channel: voice_channel,
        text_channel: message.channel,
        connection: null,
        songs: [],
        loop: false,
        skipping: false,
        stopping: false,
        timeout: null,
        volume: 0.5,
        silent: false
    };
}

function sortir_i_esborrar(song_queue, guild, abandonat) {
    const embed = new Discord.MessageEmbed()
        .setColor(getColorFromCommand(TYPE))
        .setTitle(`👋 Adeu!`);

    if (abandonat) {
        embed.setDescription(`Desconnectant del canal de veu ${song_queue.voice_channel} ja que no hi ha ningú més al canal.`);
    } else {
        embed.setDescription(`Desconnectant del canal de veu ${song_queue.voice_channel}${song_queue.stopping ? "" : ` després de ${DISCONNECTION_DELAY_SECONDS}s d'inactivitat`}.`);
    }

    song_queue.text_channel.send(embed);
    song_queue.voice_channel.leave();
    queue.delete(guild.id);
}

async function video_player(guild, song, voice_channel_name, seekTime) {
    const song_queue = queue.get(guild.id);

    if (song_queue.voice_channel.members.size === 1) {
        return sortir_i_esborrar(song_queue, guild, true);
    }

    if (!song) {
        if (song_queue.stopping)
            sortir_i_esborrar(song_queue, guild, false);
        else
            song_queue.timeout = setTimeout(sortir_i_esborrar, 1000 * DISCONNECTION_DELAY_SECONDS, song_queue, guild, false);
        return;
    }

    try {
        const stream = ytdl(song.url, {
            filter: "audioonly"
        });

        song_queue.connection
            .play(stream, {
                seek: seekTime,
                volume: song_queue.volume
            })
            .on("finish", () => {
                if (song_queue.skipping || !song_queue.loop) {
                    song_queue.songs.shift();
                    song_queue.skipping = false;
                }
                video_player(guild, song_queue.songs[0], voice_channel_name, 0);
            });

        if (!song_queue.silent) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle(`🎶 Està sonant: **${song.title}**`);

            let description = "";
            if (song_queue.loop) {
                description += "🔁 Loop activat!";
            }
            if (seekTime > 0) {
                description += `\n⏲️ Anant al segon ${seekTime}!`;
            }
            embed.setDescription(description);

            song_queue.text_channel.send(embed);
        }

    } catch (err) {
        return enviarError(message, "Alguna cosa ha petat! Hi ha hagut un error al reproduir.", err, "Al reproduir un video");
    }
}

function durationToString(duration) {
    const UNA_HORA = 60 * 60;
    if (duration > UNA_HORA) // Si es mes gran que 1h
        return `${Math.floor(duration / UNA_HORA)} h ${Math.floor((duration % UNA_HORA) / 60)} min ${duration % 60} sec`;

    if (duration > 60)
        return `${Math.floor(duration / 60)} min ${duration % 60} sec`;

    return `${duration} sec`;
}

async function enviarError(message, str, err, command = "ni idea") {
    const errorEmbed = new Discord.MessageEmbed()
        .setColor(0xff0000) // Red
        .setTitle("⚠️ Alguna cosa ha anat malament! ⚠️")
        .setDescription(str)
        .addField("Error", err, false)
        .setFooter(`Si vols reportar un bug ho pots fer amb la comanda !bug`);

    message.channel.send(errorEmbed);

    errorEmbed.addField("Guild", message.guild.name, true)
        .addField("Channel", message.channel.name, true)
        .addField("Comanda", command, true);

    let owner = await message.client.users.fetch(process.env.IdOwner);
    owner.send(errorEmbed);
}

module.exports = {

    getServerQueue: (id) => queue.get(id),

    /// ============================================

    play_song: async (message, args, server_queue, voice_channel, prefix) => {
        if (!args.length)
            return message.channel.send("**❌ Error: No se què he de posar! Necessito un segon argument.**");

        if (args[0].match(PLAYLIST_PATTERN)) {
            return message.channel.send(`**⚠️ Llista de reproducció detectada!**\nFés servir la comanda \`${prefix}playlist < URL >\` per posar totes les cançons de cop.`);
        }

        const song = await cercar_video(args, message);

        if (!song) return;

        if (song.duration > VIDEO_MAX_DURATION) {
            return message.channel.send("**❌ Error: No es poden reproduir videos de més de 5h.**");
        }

        if (!server_queue) {
            const queue_constructor = queue_constructor_generic(voice_channel, message);

            queue.set(message.guild.id, queue_constructor);
            queue_constructor.songs.push(song);

            try {
                const connection = await voice_channel.join();
                queue_constructor.connection = connection;
                video_player(message.guild, queue_constructor.songs[0], voice_channel.name, 0);
            } catch (err) {
                queue.delete(message.guild.id);
                return enviarError(message, "Hi ha hagut un error al connectar-me!", err, "play");
            }
        } else if (server_queue.timeout) {
            // Netejem el timeout
            clearTimeout(server_queue.timeout);
            server_queue.timeout = null;

            // Reproduim la cançó ara mateix
            server_queue.songs.push(song);
            video_player(message.guild, server_queue.songs[0], server_queue.voice_channel.name, 0);
        } else {
            // Temps del dispatcher actual
            const streamSeconds = server_queue.connection.dispatcher.streamTime / 1000;
            let estimatedTime = server_queue.songs[0].duration - streamSeconds; // Quant falta

            // + El temps de les de la cua
            for (let i = 1; i < server_queue.songs.length; i++) {
                estimatedTime += server_queue.songs[i].duration;
            }

            server_queue.songs.push(song);
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle(`👍 **${song.title}** afegida a la cua correctament!`)
                .setDescription(`Temps estimat per reproduir: ${durationToString(Math.floor(estimatedTime))}`);
            return message.channel.send(embed);
        }
    },

    playnow_song: async (message, args, server_queue, voice_channel, prefix) => {
        if (!args.length)
            return message.channel.send("**❌ Error: No se què he de posar! Necessito un segon argument.**");

        if (args[0].match(PLAYLIST_PATTERN)) {
            return message.channel.send(`**⚠️ Llista de reproducció detectada!**\nFés servir la comanda \`${prefix}playlist < URL >\` per posar totes les cançons de cop.`);
        }

        const song = await cercar_video(args, message);

        if (!song) return;

        if (song.duration > VIDEO_MAX_DURATION) {
            return message.channel.send("**❌ Error: No es poden reproduir videos de més de 5h.**");
        }

        if (!server_queue) {
            const queue_constructor = queue_constructor_generic(voice_channel, message);

            queue.set(message.guild.id, queue_constructor);
            queue_constructor.songs.push(song);

            try {
                const connection = await voice_channel.join();
                queue_constructor.connection = connection;
                video_player(message.guild, queue_constructor.songs[0], voice_channel.name, 0);
            } catch (err) {
                queue.delete(message.guild.id);
                return enviarError(message, "Hi ha hagut un error al connectar-me!", err, "playnow");
            }
        } else if (server_queue.timeout) {
            clearTimeout(server_queue.timeout);
            server_queue.timeout = null;

            // Reproduim la cançó ara mateix
            server_queue.songs.push(song);
            video_player(message.guild, server_queue.songs[0], server_queue.voice_channel.name, 0);
        } else {
            // Posem la cançó a la primera posició de la llista
            server_queue.songs.splice(1, 0, song);
            server_queue.skipping = true;

            // Passem a la seguent
            server_queue.connection.dispatcher.end();
        }
    },

    playnext_song: async (message, args, server_queue, voice_channel, prefix) => {
        if (!args.length)
            return message.channel.send("❌ Error: No se què he de posar! Necessito un segon argument.");

        if (args[0].match(PLAYLIST_PATTERN)) {
            return message.channel.send(`**⚠️ Llista de reproducció detectada!**\nFés servir la comanda \`${prefix}playlist < URL >\` per posar totes les cançons de cop.`);
        }

        const song = await cercar_video(args, message);

        if (!song) return;

        if (song.duration > VIDEO_MAX_DURATION) {
            return message.channel.send("❌ Error: No es poden reproduir videos de més de 5h.");
        }

        if (!server_queue) {
            const queue_constructor = queue_constructor_generic(voice_channel, message);

            queue.set(message.guild.id, queue_constructor);
            queue_constructor.songs.push(song);

            try {
                const connection = await voice_channel.join();
                queue_constructor.connection = connection;
                video_player(message.guild, queue_constructor.songs[0], voice_channel.name, 0);
            } catch (err) {
                queue.delete(message.guild.id);
                return enviarError(message, "Hi ha hagut un error al connectar-me!", err, "playnext");
            }
        } else if (server_queue.timeout) {
            clearTimeout(server_queue.timeout);
            server_queue.timeout = null;

            // Reproduim la cançó ara mateix
            server_queue.songs.push(song);
            video_player(message.guild, server_queue.songs[0], server_queue.voice_channel.name, 0);
        } else {
            // Posem la cançó a la primera posició de la llista
            server_queue.songs.splice(1, 0, song);
            const streamSeconds = server_queue.connection.dispatcher.streamTime / 1000;
            let estimatedTime = server_queue.songs[0].duration - streamSeconds; // Quant falta

            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle(`👍 **${song.title}** afegida al principi de la cua correctament!`)
                .setDescription(`Temps estimat per reproduir: ${durationToString(Math.floor(estimatedTime))}`);
            return message.channel.send(embed);
        }
    },

    playlist_songs: async (message, args, server_queue, voice_channel) => {
        if (!args.length) {
            return message.channel.send("**❌ Error: No se què he de posar! Necessito un segon argument.**");
        }
        let songs = [];

        if (args[0].match(PLAYLIST_PATTERN)) {
            const video_finder = async (query) => {
                const url = new URL(query);
                const listID = url.searchParams.get("list");
                const video_result = await ytSearch({
                    listId: listID
                });
                return video_result.videos.length > 1 ? video_result.videos : null;
            };

            let videos;
            try {
                videos = await video_finder(args.join(" "));
            } catch (err) {
                return enviarError(message, "La playlist no està disponible.**\n" +
                    "Mira si és publica i que no provingui de `music.youtube.com`", err, "playlist");
            }

            if (videos) {
                for (let video of videos) {
                    if (video.duration.seconds <= VIDEO_MAX_DURATION && video.duration.seconds !== 0) {
                        songs.push({
                            title: video.title,
                            url: `https://youtube.com/watch?v=${video.videoId}`,
                            duration: video.duration.seconds,
                            channel: video.author.name,
                            thumbnail: video.thumbnail,
                            requestedBy: message.author
                        });
                    }
                }
            } else {
                return message.channel.send("**❌ Error: No s'ha trobat cap video a la playlist.**");
            }
        } else {
            return message.channel.send("**❌ Error: Posa un enllaç de playlist vàlid, siusplau.**");
        }

        let willPlayNow = !server_queue;

        // Temps del dispatcher actual
        let estimatedTime = 0;
        if (server_queue) {
            if (server_queue.timeout) {
                willPlayNow = true;
                clearTimeout(server_queue.timeout);
                server_queue.timeout = null;
            } else {
                const streamSeconds = server_queue.connection.dispatcher.streamTime / 1000;
                estimatedTime = server_queue.songs[0].duration - streamSeconds; // Quant falta

                // + El temps de les de la cua
                for (let i = 1; i < server_queue.songs.length; i++) {
                    estimatedTime += server_queue.songs[i].duration;
                }
            }
        }

        for (let song of songs) {
            if (!server_queue) {
                const queue_constructor = queue_constructor_generic(voice_channel, message);
                queue.set(message.guild.id, queue_constructor);
                queue_constructor.songs.push(song);
                server_queue = queue.get(message.guild.id);
            } else {
                server_queue.songs.push(song);
            }
        }

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`👍 S'ha afegit ${songs.length} cançons a la cua correctament!`);

        if (estimatedTime > 0) {
            embed.setDescription(`Temps estimat per reproduir: ${durationToString(Math.floor(estimatedTime))}`);
        }

        message.channel.send(embed);

        if (willPlayNow) {
            try {
                const connection = await voice_channel.join();
                server_queue.connection = connection;
                video_player(message.guild, server_queue.songs[0], voice_channel.name, 0);
            } catch (err) {
                queue.delete(message.guild.id);
                return enviarError(message, "Hi ha hagut un error al connectar-me!", err, "playlist");
            }
        }
    },

    skip_song: (message, server_queue) => {
        if (!message.member.voice.channel)
            return message.channel.send(
                "❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!"
            );

        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No hi ha cap cançó a la cua 😔");
            return message.channel.send(embed);
        }

        if (server_queue.connection.dispatcher.paused) {
            server_queue.connection.dispatcher.resume();
        }

        server_queue.skipping = true;
        server_queue.connection.dispatcher.end();
    },

    stop_song: (message, server_queue) => {
        if (!message.member.voice.channel)
            return message.channel.send(
                "**❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!**"
            );

        if (!server_queue) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No hi ha cap cançó a la cua 😔");
            return message.channel.send(embed);
        }

        if (server_queue.timeout) {
            server_queue.songs = [];
            server_queue.stopping = true;
            clearTimeout(server_queue.timeout);
            server_queue.timeout = null;
            return sortir_i_esborrar(server_queue, message.guild, false);
        }

        if (server_queue.connection.dispatcher.paused) {
            server_queue.connection.dispatcher.resume();
        }

        server_queue.songs = [];
        server_queue.stopping = true;
        server_queue.connection.dispatcher.end();
    },

    clear_list: (message, server_queue, args) => {
        if (!message.member.voice.channel)
            return message.channel.send(
                "**❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!**"
            );

        if (!server_queue || server_queue.songs.length === 1) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No hi ha cap cançó a la cua 😔");
            return message.channel.send(embed);
        }

        let n = server_queue.songs.length - 1; // Totes menys la actual (la primera)

        if (args[0]) {
            if (isNaN(args[0])) {
                return message.channel.send("**❌ Error: La quantitat a esborrar ha de ser un numero!**");
            }
            n = parseInt(args[0]);
        }

        if (n <= 0) {
            return message.channel.send("**❌ Error: La quantitat ha de ser un numero positiu!**");
        }

        if (n >= server_queue.songs.length) {
            message.channel.send("**⚠️ Avís: La quantitat és més gran que la mida de la llista, esborrant totes...**");
            n = server_queue.songs.length - 1;
        }

        server_queue.songs.splice(1, n);

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🗑️ Esborrades ${n} cançons correctament!`);
        return message.channel.send(embed);
    },

    show_list: (message, server_queue, args) => {

        if (!message.member.voice.channel)
            return message.channel.send(
                "**❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!**"
            );

        if (!server_queue || server_queue.songs.length <= 1) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No hi ha cap cançó a la cua 😔");
            return message.channel.send(embed);
        }

        let nPagina = 1;

        if (args[0]) {
            if (isNaN(args[0])) {
                return message.channel.send("**❌ Error: El numero de pàgina ha de ser un numero enter.**");
            }
            nPagina = parseInt(args[0]);
        }

        const songs = server_queue.songs;
        const n = songs.length - 1;
        const nPagines = Math.ceil(n / MAX_VIEW_SONG_LIST);
        const ultimaPagina = n % MAX_VIEW_SONG_LIST;

        if (nPagina <= 0 || nPagina > nPagines) {
            return message.channel.send("**❌ Error: Numero de pàgina invàlid.**");
        }

        const minim = MAX_VIEW_SONG_LIST * (nPagina - 1) + 1;
        const midaPagina = (nPagina === nPagines) ? ultimaPagina : MAX_VIEW_SONG_LIST;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🎵 **${songs[0].title}** 🎵`);

        for (let i = minim; i < minim + midaPagina; i++) {
            embed.addField(`${i}.- ${songs[i].title}`, `${songs[i].channel} | ${durationToString(songs[i].duration)} | ${songs[i].requestedBy}`, false);
        }

        let totalTime = 0;
        for (let i = 1; i < songs.length; i++) {
            totalTime += songs[i].duration;
        }

        embed.setFooter(`Pàgina ${nPagina}/${nPagines} | Cançons ${minim}-${minim + midaPagina - 1} | Total ${n} | Duració ${durationToString(totalTime)}`);

        message.channel.send(embed);
    },

    show_np: (message, server_queue) => {
        if (!message.member.voice.channel)
            return message.channel.send(
                "**❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!**"
            );

        if (!server_queue || server_queue.timeout) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No està sonant cap cançó 😔");
            return message.channel.send(embed);
        }

        const current = server_queue.songs[0];
        const N_LINE_CHARS = 10;
        const secondsPlaying = server_queue.connection.dispatcher.streamTime / 1000;
        const percent = secondsPlaying / current.duration * N_LINE_CHARS;
        let line = "";

        for (let i = 0; i < N_LINE_CHARS; i++) {
            if (i < percent) {
                line += "▰";
            } else {
                line += "▱";
            }
        }

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setDescription(`${line} ${durationToString(Math.floor(secondsPlaying))} | [🔗](${current.url})`)
            .setTitle(`🎵 **${current.title}** 🎵`)
            .addField('❯ Canal', current.channel, true)
            .addField('❯ Duració', durationToString(current.duration), true)
            .addField('❯ Afegida per', current.requestedBy, true)
            .addField('❯ Loop', server_queue.loop ? "Activat" : "Desactivat", true)
            .addField('❯ Volume', `${server_queue.connection.dispatcher.volume * 100}%`, true)
            .setThumbnail(current.thumbnail);

        message.channel.send(embed);
    },

    pause_song: (message, server_queue, prefix) => {

        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        if (server_queue.connection.dispatcher.paused) {
            return message.channel.send(`**⚠️ Alerta: El reproductor ja està pausat!**\nPosa \`${prefix}resume\` per rependre la reproducció`);
        }
        try {
            server_queue.connection.dispatcher.pause();
        } catch (err) {
            console.error(err);
            return enviarError(message, "Hi ha hagut un error al pausar!", err, "pause");
        }
        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle("⏸️ Pausant...")
            .setDescription(`Per rependre la reproducció posa \`${prefix}resume\``);
        message.channel.send(embed);
    },

    resume_song: (message, server_queue) => {
        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        if (!server_queue.connection.dispatcher.paused) {
            return message.channel.send(`**⚠️ Alerta: El reproductor no està pausat!**`);
        }

        try {
            server_queue.connection.dispatcher.resume();
        } catch (err) {
            console.error(err);
            return enviarError(message, "Hi ha hagut un error al rependre la cançó!", err, "resume");
        }

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle("⏯️ Reprenent...");
        message.channel.send(embed);
    },

    switch_loop: (message, server_queue) => {

        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        let paraula = server_queue.loop ? "Desactivant" : "Activant";

        server_queue.loop = !server_queue.loop;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🔁 ${paraula} loop...`);
        message.channel.send(embed);
    },

    set_volume: (message, server_queue, newVolume) => {

        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        if (!newVolume) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle(`🔊 Volum actual: ${server_queue.connection.dispatcher.volume * 100}%`);
            return message.channel.send(embed);
        } else if (isNaN(newVolume)) {
            if (newVolume === "earrape") {
                newVolume = 5000;
            } else {
                return message.channel.send('**❌ Error: El numero cal que sigui un enter o la paraula màgica**');
            }
        } else if (newVolume < 0 || newVolume > 200) {
            return message.channel.send('**❌ Error: El numero cal que sigui enter entre 0 i 200!**');
        }

        server_queue.connection.dispatcher.setVolume(parseInt(newVolume) / 100);
        server_queue.volume = server_queue.connection.dispatcher.volume;

        const earrapeSynonims = [
            'PAIN', 'EARRAPE', 'OH NO', 'HERE WE GO AGAIN', "T'acabes de guanyar el bonk, per bobo"
        ];

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🔊 Nou volum: ${newVolume === 5000 ? getRandomFromArray(earrapeSynonims) : `${newVolume}%`}`);

        return message.channel.send(embed);
    },

    silent_mode: (message, server_queue) => {

        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        server_queue.silent = !server_queue.silent;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🔇 Mode silenci ${server_queue.silent ? "activat" : "desactivat"} correctament!`);
        return message.channel.send(embed);
    },

    shuffle_list: (message, server_queue) => {
        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        if (server_queue.songs.length <= 1) {
            return message.channel.send('**❌ Error: No hi ha cap cançó a la cua per barrejar 😔**');
        }

        let songs = server_queue.songs;
        let current = songs[0];
        let toShuffle = [...songs.slice(1)]; // All the others

        toShuffle = shuffleArray(toShuffle);
        toShuffle.unshift(current);
        server_queue.songs = toShuffle;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🔀 Llista barrejada correctament!`);
        return message.channel.send(embed);
    },

    invert_list: (message, server_queue) => {
        if (!server_queue || !server_queue.connection || !server_queue.connection.dispatcher) {
            return message.channel.send('**❌ Error: No hi ha cançons reproduint-se!**');
        }

        if (server_queue.songs.length <= 1) {
            return message.channel.send('**❌ Error: No hi ha cap cançó a la cua per invertir 😔**');
        }

        let songs = server_queue.songs;
        let current = songs[0];
        let toInvert = [...songs.slice(1)]; // All the others

        toInvert.reverse();
        toInvert.unshift(current);
        server_queue.songs = toInvert;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(`🙃 Llista invertida correctament!`);
        return message.channel.send(embed);
    },

    seekSecond: (message, server_queue, voice_channel, second) => {
        if (!message.member.voice.channel)
            return message.channel.send(
                "**❌ Error: Necessites estar en un canal de veu per executar aquesta comanda!**"
            );

        if (!server_queue || server_queue.timeout) {
            let embed = new Discord.MessageEmbed()
                .setColor(getColorFromCommand(TYPE))
                .setTitle("No està sonant cap cançó 😔");
            return message.channel.send(embed);
        }

        const current = server_queue.songs[0];
        if (second > current.duration) {
            return message.channel.send("**❌ Error: El segon que vols anar està fora de la cançó! Ves amb compte amb la duració.**");
        } else if (second < 0) {
            return message.channel.send("**❌ Error: Els segons han de ser positius o 0 per anar al principi.**");
        }
        video_player(message.guild, current, voice_channel.name, second);
    },

    /// ============================================

    mostrar_opcions: (message, server) => {

        const prefix = server.prefix;

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle("🎵 **Comandes de MUSICA** 🎵")
            .setDescription("Els paràmetres entre < > són obligatoris i els marcats entre [ ] són opcionals.")
            .addField(`❯ ${prefix}play < URL / cerca >`, "El bot s'unirà al teu canal de veu i reproduirà les cançons que vulguis.", false)
            .addField(`❯ ${prefix}playNow < URL / cerca >`, "Posa una cançó ara mateix.\nLa comanda respectarà la cua següent però es passarà la cançó actual.", false)
            .addField(`❯ ${prefix}playNext < URL / cerca >`, "Posa una cançó al principi de la cua.", false)
            .addField(`❯ ${prefix}playlist < URL >`, "Posa totes les cançons que vulguis en una fracció de segon!", false)
            .addField(`❯ ${prefix}skip / next`, "Es passarà a la següent cançó de la llista.", false)
            .addField(`❯ ${prefix}stop / disconnect`, "No vols més musica? El bot s'envà del canal esborrant les cançons de la llista.", false)
            .addField(`❯ ${prefix}q / queue / llista [ nPagina ]`, "Et mostra la llista de reproducció.", false)
            .addField(`❯ ${prefix}np / nowplaying`, "Et mostra la cançó que està sonant ara mateix.", false)
            .addField(`❯ ${prefix}clear [ n ]`, "Esborra algunes o totes les cançons de la llista.", false)
            .addField(`❯ ${prefix}pause`, "Posa la reproducció en pausa.", false)
            .addField(`❯ ${prefix}resume`, "Repren la reproducció pausada.", false)
            .addField(`❯ ${prefix}volume [ n ]`, "Posa un nou volum de la reproducció. Et mostra el volum actual si no es passa cap paràmetre.", false)
            .addField(`❯ ${prefix}loop`, "Alterna el mode LOOP. Quan està activat, el bot reproduirà la mateixa cançó una i altra vegada.", false)
            .addField(`❯ ${prefix}silent/ silentMode`, "Alterna el mode SILENT. Aquest fa que el bot no mostri la cançó actual quan passa a la següent cançó.", false)
            .addField(`❯ ${prefix}shuffle`, "Barreja la cua de reproducció.", false)
            .addField(`❯ ${prefix}invert`, "Inverteix la cua de reproducció.", false)
            .addField(`❯ ${prefix}seek`, "Ves a un segon de la cançó actual.", false)
            .setTimestamp().setFooter(`CataBOT ${new Date().getFullYear()} © All rights reserved`);

        message.channel.send(embed);

    },

};