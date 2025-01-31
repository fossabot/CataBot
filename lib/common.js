const chalk = require('chalk');
const types = require("../storage/commandTypes.json");

module.exports = {
    getRandomColor: () => {
        let letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    },

    shuffleArray: (array) => {
        var currentIndex = array.length,
            temporaryValue, randomIndex;

        // While there remain elements to shuffle...
        while (0 !== currentIndex) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }

        return array;
    },

    separateWithCommas: (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","),

    getRandomFromArray: (array) => array[Math.floor(Math.random() * array.length)],

    getColorFromCommand: (type = "altres") => types[type].color,

    // Log colors
    log: chalk.bold.green,
    remove: chalk.bold.red,
    bot: chalk.bold.blue,
    db: chalk.bold.cyan
};