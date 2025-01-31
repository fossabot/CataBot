const Discord = require("discord.js");
const fetch = require('node-fetch');
const {
    getColorFromCommand,
    separateWithCommas
} = require('../../lib/common.js');

const TYPE = "entreteniment";

module.exports = {
    name: 'covid',
    description: 'Mostra la info del Coronavirus actualment',
    type: TYPE,
    usage: '[ country ]',
    aliases: ['coronavirus'],
    async execute(message, args, server) {

        let covidUrl = "https://coronavirus-19-api.herokuapp.com/";
        let codeUrl = "https://api.printful.com/countries/";
        let covidData = {};
        let flag = "https://i.imgur.com/oEmt2KA.png";
        let country = "";
        let isWorld = false;

        if (args[0]) {
            covidUrl += "countries/" + args[0].toLowerCase();
            country = args[0];
            if (country.toLowerCase() === "world") {
                isWorld = true;
            }
        } else {
            covidUrl += "countries/world";
            isWorld = true;
        }

        async function getInfo() {
            await fetch(covidUrl)
                .then(res => res.json())
                .then((data) => {
                    covidData = data;
                });
        }

        async function getFlag() {
            await fetch(codeUrl)
                .then(res => res.json())
                .then((data) => {
                    let code = "";
                    data.result.forEach(element => {
                        if (element.name.toLowerCase() === args[0].toLowerCase()) {
                            code = element.code;
                        }
                    });
                    flag = "https://cdn.staticaly.com/gh/hjnilsson/country-flags/master/png250px/" + code.toLowerCase() + ".png";
                });
        }

        try {
            await getInfo();
        } catch (err) {
            message.reply("el país no existeix! Recorda que ho has de posar en anglès!");
            return message.channel.send(server.prefix + "help covid");
        }

        if (!isWorld) {
            await getFlag().catch(console.error);
        }

        const covidEmbed = new Discord.MessageEmbed()
            .setColor(getColorFromCommand(TYPE))
            .setTitle(isWorld ? "**CORONAVIRUS AL MON**" : "**CORONAVIRUS A " + country.toUpperCase() + "**")
            .setThumbnail(flag);


        Object.keys(covidData).forEach(camp => {
            // Convertimos el campo en space case
            let result = camp.replace(/([A-Z])/g, " $1");
            let finalResult = result.charAt(0).toUpperCase() + result.slice(1);
            if (covidData[camp]) {
                covidEmbed.addField("❯ " + finalResult, separateWithCommas(covidData[camp]), true);
            }
        });

        covidEmbed.setTimestamp().setFooter(`CataBOT ${new Date().getFullYear()} © All rights reserved`);

        message.channel.send(covidEmbed);

    },
};