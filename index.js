#!/usr/bin/env node
'use strict'

const yargs = require('yargs')

const cli = function() {
  var argv = yargs
    .usage('usage: $0 <command>')
    .commandDir('./cmd')
    .demand(1)
    .option('debug', {
      describe: 'Logs debug information to console output',
      global: true,
      type: 'boolean',
      default: false
    })
    .help('help')
    .version()
    .wrap(null)
    .argv

    if(argv.debug) {
      require('./lib/debug')()
      require('./lib/logger').debug('Enabled debug logs')
    }
}

cli()
