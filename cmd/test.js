'use strict'

const config = require('../lib/config')

const command = 'test <regexp>'
const describe = 'Test'
const builder = function (yargs) {

  return yargs
    .usage(`usage: $0 test <regexp>`)
    .demand(1)
    .help('help')
    .wrap(null)
}

const handler = function(argv) {

  const names = [
    'Test Plan: Deploy To Staging',
    'Test Plan: Escapes',
    'Test Plan: MBaaS',
    'Test Plan: Self Managed',
    'Test Plan: SDKs',
    'Test Plan: WFM',
    'Test Plan: End-2-End (UART)'
  ]

  names.forEach(name => {
    const rx = new RegExp(argv.regexp)
    console.log(`${name} ${rx.test(name)}`)
  })
}

module.exports = {command, describe, builder, handler}
