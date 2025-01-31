const {
    db
} = require('../../lib/common.js');
const {
    updateUser
} = require('../../lib/database.js');

const TYPE = "privat";

module.exports = {
    name: 'setmoney',
    description: 'Adjudica una quantitat a una persona',
    type: TYPE,
    usage: '< amount > < @user >',
    execute(message, args, server) {

        // ************* Precondicions *************

        if (message.author.id != process.env.IdOwner) {
            message.reply("aquesta comanda només pot ser executada per administradors del bot!");
            return message.channel.send(server.prefix + "help setmoney");
        }

        // Si no hi ha diners
        if (!args[0]) {
            message.reply("no has posat els diners!");
            return message.channel.send(server.prefix + "help setmoney");
        } else if (isNaN(args[0])) {
            // Si els diners no es un numero
            message.reply("els diners han de ser un numero!");
            return message.channel.send(server.prefix + "help setmoney");
        } else if (args[0] < 0) {
            // si el numero de diners es negatiu
            message.reply("els diners han de ser positius!");
            return message.channel.send(server.prefix + "help setmoney");
        }

        // si no hi ha usuari mencionat
        if (!args[1]) {
            message.reply("no has posat l'usuari a pagar!");
            return message.channel.send(server.prefix + "help setmoney");
        } else if (!message.mentions.members.first()) {
            message.reply("no has posat l'usuari a pagar!");
            return message.channel.send(server.prefix + "help setmoney");
        }

        let amount = Number(args[0]);
        let otherUser = message.mentions.users.first();

        if (otherUser.bot) {
            // si el mencionat es un bot
            return message.reply("no pots pagar a un bot!");
        }

        if (!message.guild.member(otherUser.id)) {
            // si el mencionat no esta al servidor
            return message.reply("l'usuari mencionat no es troba al servidor!");
        }

        // ************* Transacció *************

        // Adjudicar diners a otherUser
        updateUser([otherUser.id, message.guild.id], {
            money: amount
        }).then(console.log(db(`DB: Adjudicades ${amount} monedes a ${otherUser.username} correctament`)));

        message.reply("has adjudicat " + amount + " monedes a " + otherUser.username + " correctament! 💸");
    },
};