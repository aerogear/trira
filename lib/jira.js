'use strict'

const Jira = require('jira-client')
const request = require('request-promise')
const kerberosAuthCookie = require('./kerberos')
const logger = require('./logger')

const jira = jiraConfig => {
  return new Promise((resolve, reject) => {

    const config = Object.assign({
      protocol: 'https',
      port: 443,
      apiVersion: 2,
    }, jiraConfig)

    if(jiraConfig.gssApi) {
      logger.debug(`Negotiating GSS Auth with ${jiraConfig.host}`)
      return kerberosAuthCookie(jiraConfig.host, jiraConfig.strictSSL)
        .then(cookie => {
          // override jira request object to use cookie based auth
          config.request = request.defaults({
            headers: {
              cookie: cookie
            }
          })
          // remove username and password to make sure that cookie is used
          config.username = ''
          config.password = ''
          return resolve(new Jira(config))
        })
        .catch(error => {
          return reject(error)
        })
    }
    else {
      return resolve(new Jira(config))
    }
  })
}

module.exports = jira