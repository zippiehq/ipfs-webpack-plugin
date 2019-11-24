#!/usr/bin/env node
const IPFS = require('ipfs')
const dotenv = require('dotenv')
const zutils = require('@zippie/zippie-utils')
const fs = require('fs')
dotenv.config()

const source_dir = process.env.IPFS_WEBPACK_SOURCE_DIR ? process.env.IPFS_WEBPACK_SOURCE_DIR : 'build'
const ipfs_repo = process.env.IPFS_WEBPACK_REPO ? process.env.IPFS_WEBPACK_SOURCE_DIR : '.ipfs-webpack-plugin'
const ipfs_filelist = process.env.IPFS_WEBPACK_FILELIST ? process.env.IPFS_WEBPACK_FILELIST : 'build-ipfs-filelist.json'

async function run() {
  IPFS.create({ repo: ipfs_repo, start: false }).then(async (ipfs) => {
    const filelist = JSON.parse(fs.readFileSync(ipfs_filelist))
    console.log('IPFS CID: ' + filelist[source_dir].hash)
    if (process.env.IPFS_WEBPACK_UPLOAD) {
      console.log('Starting IPFS node up..')
      await ipfs.start()
      if (process.env.IPFS_WEBPACK_SWARM_CONNECT) {
        console.log('IPFS - connecting to ' + process.env.IPFS_WEBPACK_SWARM_CONNECT)
        await ipfs.swarm.connect(process.env.IPFS_WEBPACK_SWARM_CONNECT)
      }
      if (process.env.IPFS_WEBPACK_CIDHOOK_PINNER && process.env.IPFS_WEBPACK_CIDHOOK_SECRET) {
        function waitTimeout(timeout) {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              resolve()
            }, timeout)
          })
        }

        console.log('Pinning ' + filelist[source_dir].hash + ' on ' + process.env.IPFS_WEBPACK_CIDHOOK_PINNER)
        var options = {}
        options['headers'] = { 'Authorization': process.env.IPFS_WEBPACK_CIDHOOK_SECRET }
        options['method'] = 'POST'
        await fetch(process.env.IPFS_WEBPACK_CIDHOOK_PINNER + '/' + filelist[source_dir].hash, options)
        if (process.env.IPFS_WEBPACK_CIDHOOK_WAIT) {
          var wait = parseInt(process.env.IPFS_WEBPACK_CIDHOOK_WAIT) * 1000
          console.log('Waiting ' + wait + 'ms for pin to finish')
          await waitTimeout(wait)
        }
      }
      if (process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY) {
        console.log('Appending CID ' + filelist[source_dir].hash + ' to Zippie permastore2')
        let result = await zutils.permastore.insertCID(filelist[source_dir].hash, zutils.signers.secp256k1(process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY))
      }
      console.log('Stopping IPFS node... ')
      await ipfs.stop()
    }
  })
}



run().then(() => {}).catch((err) => {
  throw err
})