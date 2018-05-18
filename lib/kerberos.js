'use strict'

const Kerberos = require('kerberos').Kerberos;
const request = require('request')
const caseless = require('caseless')
const util = require('util')
const logger = require('./logger')

const GSS_PATH = 'step-auth-gss'

const kerberosAuthCookie = (host, strictSSL, flags) => {
  flags = flags || Kerberos.GSS_C_MUTUAL_FLAG
  
  return new Promise((resolve, reject) => {

    const url = `https://${host}:443/${GSS_PATH}` 

    const req = request.defaults({
      forever: true,
      strictSSL  
    })

    const callback = (error, response, body) => {
      if(error) {
        return reject(error)
      }
      const authHeader = caseless(response.headers).get('www-authenticate')
      if(response.statusCode === 401 && authHeader) {
        logger.debug(`SPNEGO challenge ${authHeader}`)
        const kerberos = new Kerberos()
        kerberos.authGSSClientInit(`HTTP@${host}`, flags, (err, ctx) => {
          if(err) { 
            return reject(new Error(`Kerberos init failed: ${util.inspect(err)}`))
          }
          logger.debug('Initialized Kerberos context')
          kerberos.authGSSClientStep(ctx, authHeader || '', err => {
            if(err) {
              return reject(new Error(`Kerberos auth failed: ${util.inspect(err)}`))
            }
            const token = ctx.response
            logger.debug(`Acquired Kerberos ticket negotiation data ${token}`)
            kerberos.authGSSClientClean(ctx, err => {
              if (err) {
                return reject(new Error(`Kerberos cleanup failed: ${util.inspect(err)}`))
              }
              req(url, {
                headers: {
                  'authorization': `Negotiate ${token}`
                }
              }, callback)
            })
          })
        })  
      }
      if(response.statusCode === 200) {
        let sessionIdHeader = caseless(response.headers).get('set-cookie').find(c => c.startsWith('JSESSIONID')) || ''
        sessionIdHeader = sessionIdHeader.split(';')[0]
        return resolve(sessionIdHeader)
      }
      if(response.statusCode === 403) {
        return reject(new Error('Kerberos based auth has been forbidden. You might not have enough rights or incompatible Kerberos implementation (macOS)'))
      }
    }
    req(url, callback) 
  })
}

module.exports = kerberosAuthCookie