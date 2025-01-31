const Discord = require("discord.js");
const {
    getColorFromCommand
} = require('../../lib/common.js');

const TYPE = "entreteniment";

module.exports = {
    name: 'flipword',
    description: 'Posa la paraula al revés',
    type: TYPE,
    usage: '< word >',
    aliases: ['flip'],
    execute(message, args, server) {

        if (!args[0]) {
            message.reply("no se què girar!");
            message.channel.send(server.prefix + "help flipword");
            return;
        }

        function reverseString(str) {
            return str.split("").reverse().join("");
        }

        let word = args.join(" ");
        word = reverseString(word);

        let msg = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle("**FLIP THE WORD**")
            .setThumbnail('https://bit.ly/CataBot_RawIcon')
            .addField('❯ Resultat', word, true)
            .setTimestamp().setFooter(`CataBOT ${new Date().getFullYear()} © All rights reserved`);

        message.channel.send(msg);
    },
};