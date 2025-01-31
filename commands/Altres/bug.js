const Discord = require("discord.js");
const {
    getColorFromCommand
} = require('../../lib/common.js');

const TYPE = "altres";

module.exports = {
    name: 'bug',
    description: 'Avisa al propietari del bot d\'algun bug.',
    type: TYPE,
    async execute(message) {

        message.reply("has rebut tota la info necessaria per DM");

        let titol = await message.author.send("**------------- INFORMANT D'UN BUG/MILLORA/ALTRES -------------**");
        let assumpte = "";
        let cos = "";
        let tipus = "altres";
        const emojis = ['⚠️', '❤️', '❓', '❌'];

        seleccionar_tipus_msg = await titol.channel.send("Selecciona una opció: Bug [⚠️], Millora [❤️], Altres [❓] o Cancel·lar [❌]");

        emojis.forEach(async (emoji) => {
            await seleccionar_tipus_msg.react(emoji);
        });

        // Esperem la reaccio de l'usuari
        let c = "";
        const filter_reactions = (reaction, user) => emojis.includes(reaction.emoji.name) && (user.id === message.author.id);
        let collected = await seleccionar_tipus_msg.awaitReactions(filter_reactions, {
            max: 1,
            time: 600000,
            errors: ['time']
        }).catch(error => {
            console.error(error);
            return message.author.send("S'ha acabat el temps! La pròxima vegada vés més ràpid!");
        });
        const reaction = collected.first();
        switch (reaction.emoji.name) {
            case "⚠️":
                tipus = "bug";
                c = " DEL BUG";
                titol.edit("**------------- INFORMANT D'UN BUG -------------**");
                break;
            case "❤️":
                tipus = "millora";
                c = " DE LA MILLORA";
                titol.edit("**------------- INFORMANT D'UNA MILLORA -------------**");
                break;
            case '❌':
                message.author.send("Operació cancel·lada correctament");
                return;
            default:
                tipus = "altres";
                titol.edit("**------------- INFORMANT D'UNA ALTRA COSA -------------**");
                break;
        }

        await seleccionar_tipus_msg.delete();
        let msg = await titol.channel.send("**1.- ASSUMPTE " + c + "**");

        // Esperem resposta
        const filter = _m => true;
        await msg.channel.awaitMessages(filter, {
            max: 1,
            time: 600000,
            errors: ['time']
        }).then(collected => {
            assumpte = collected.first().content;
        }).catch(error => {
            console.error(error);
            return message.author.send("S'ha acabat el temps! La pròxima vegada vés més ràpid!");
        });

        await message.author.send("**2.- COS " + c + "**");
        // Esperem resposta
        await msg.channel.awaitMessages(filter, {
            max: 1,
            time: 600000,
            errors: ['time']
        }).then(collected => {
            cos = collected.first().content;
        }).catch(error => {
            console.error(error);
            return message.author.send("S'ha acabat el temps! La pròxima vegada vés més ràpid!");
        });

        // Enviem el missatge a l'owner del servidor
        function firstCapital(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }

        let embed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle("**AVÍS del BOT**")
            .addField('❯ Autor', message.author.tag, true)
            .addField('❯ Tipus', firstCapital(tipus), true)
            .addField('❯ Servidor', message.guild.name, true)
            .addField('❯ Assumpte', assumpte, false)
            .addField('❯ Cos', cos, false)
            .setTimestamp().setFooter(`CataBOT ${new Date().getFullYear()} © All rights reserved`);

        // Envia el missatge al owner del bot
        let owner = await message.client.users.fetch(process.env.IdOwner);
        await owner.send(embed);

        // Confirmem l'enviament
        await message.author.send(embed);
        await message.author.send("**Gràcies per informar.** Aquí tens un confirmant de l'avís. " +
            "Hem avisat al propietari del bot.\n");
    },
};