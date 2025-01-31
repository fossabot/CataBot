const Discord = require("discord.js");
const {
    getColorFromCommand
} = require('../../lib/common.js');

const TYPE = "altres";

module.exports = {
    name: 'info',
    description: 'Diu la informació del bot.',
    type: TYPE,
    aliases: ['stats', 'bot'],
    execute(message, _args, server, client) {

        let description = "Soc un **BOT** de discord **en català**! Espero que sigui agradable la meva presencia en aquest servidor, " + message.author.username + ". Pots veure totes les meves comandes amb " + server.prefix + "help.";

        let info = `• **Desenvolupador:** ${process.env.ownerDiscordUsername}\n` +
            `• **Pagina web: [catalahd.github.io/CataBot](${process.env.website})**\n` +
            `• **Servidor Oficial: [discord.gg/k75qvYM](${process.env.officialServerLink})**`;

        let nMembers = 0;
        client.guilds.cache.forEach(guild => {
            nMembers += guild.memberCount;
        });

        let stats = "• **Membres:** `" + nMembers + "`\n" +
            "• **Servers:** `" + client.guilds.cache.size + "`\n" +
            "• **Comandes:** `" + client.commands.size + "`";

        let msg = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setAuthor(`CataBOT [v${process.env.version}] by Català HD`, 'https://raw.githubusercontent.com/CatalaHD/CataBot/master/imgs/gif_frames/icon_new.gif', 'https://github.com/CatalaHD/CataBot')
            .setDescription(description)
            .addField('❯ Informació:', info, true)
            .addField('❯ Estadistiques:', stats, true)
            .setTimestamp().setFooter(`CataBOT ${new Date().getFullYear()} © All rights reserved`);

        message.channel.send(msg);
    },
};