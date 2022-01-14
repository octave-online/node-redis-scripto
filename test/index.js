#!/usr/bin/env node

const Mocha = require("mocha");

const mocha = new Mocha();
mocha.reporter("spec").ui("tdd");

mocha.addFile("test/scripto.js");

const runner = mocha.run(function () {
  process.exit(0);
});
