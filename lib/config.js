'use strict'

const fs = require('fs')
const path = require('path')
const request = require('request')
const logger = require('./logger')

const writeConfiguration = function(config) {

  return new Promise((resolve, reject) => {
    // write down configuration to a file
    let configFile = configurationPaths[0]
    fs.writeFile(configFile, JSON.stringify(config, null, 2), err => {
      if(err) {
        logger.trace({configFile, err}, 'Unable to write down configuration to HOME directory')
        // use local directory instead as fallback option
        configFile = configurationPaths[1]
        fs.writeFile(configFile, JSON.stringify(config, null, 2), err => {
          if(err) {
            logger.trace({configFile, err}, 'Unable to write down configuration to current working directory neither')
            return reject({configFile, err})
          }
          else {
            logger.trace({configFile}, 'Trira configuration stored to local directory')
            return resolve(configFile)
          }
        })
      }
      else {
        logger.trace({configFile}, 'Trira configuration stored to HOME directory')
        return resolve(configFile)
      }
    })
  })
}

const updateConfiguration = function(...newConfig) {

  return readConfiguration()
    .then(allConfig => {
      Object.assign(allConfig, ...newConfig)
      return writeConfiguration(allConfig)
    })
    .catch(err => {
      logger.trace(err, 'Unable to read trira configuration')
      const freshConfiguration = Object.assign({}, ...newConfig)
      return writeConfiguration(freshConfiguration)
    })
}

const readConfiguration = function() {

  return new Promise((resolve, reject) => {
    // find configuration file
    let configFile = configurationPaths[0]
    fs.readFile(configFile, (err, data) => {
      if(err) {
        logger.trace({configFile, err}, 'Unable to read configuration file from HOME directory')
        configFile = configurationPaths[1]
        fs.readFile(configFile, (err, data) => {
          if(err) {
            logger.trace({configFile, err}, 'Unable to read configuration file from current working directory neither')
            return reject({configFile, err})
          }
          else {
            try {
              logger.trace({configFile}, 'Loaded configuration from current working directory')
              return resolve(JSON.parse(data))
            }
            catch(e) {
              return reject({e, data})
            }
          }
        })
      }
      else {
        try {
          logger.trace({configFile}, 'Loaded configuration from HOME directory')
          return resolve(JSON.parse(data))
        }
        catch(e) {
          return reject({e, data})
        }
      }
    })
  })

}

const configurationPaths = (() => {
  const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE
  return [ path.resolve(HOME, '.trira'), path.resolve(process.cwd(), '.trira')]
})()

module.exports = {
  readConfiguration,
  writeConfiguration,
  updateConfiguration,
  configurationPaths
}
