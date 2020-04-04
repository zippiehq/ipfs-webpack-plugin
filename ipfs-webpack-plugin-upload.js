#!/usr/bin/env node
const axios = require('axios')
const IPFS = require('ipfs')
const dotenv = require('dotenv')
const zutils = require('@zippie/zippie-utils')
const fs = require('fs')
const Web3 = require('web3')
const zippieWeb3Ens = require('@zippie/zippie-web3-utils').ens
const FormData = require('form-data');

dotenv.config()

const source_dir = process.env.IPFS_WEBPACK_SOURCE_DIR ? process.env.IPFS_WEBPACK_SOURCE_DIR : 'build'
const ipfs_repo = process.env.IPFS_WEBPACK_REPO ? process.env.IPFS_WEBPACK_SOURCE_DIR : '.ipfs-webpack-plugin'
const ipfs_filelist = process.env.IPFS_WEBPACK_FILELIST ? process.env.IPFS_WEBPACK_FILELIST : 'build-ipfs-filelist.json'

async function run() {
  IPFS.create({ repo: ipfs_repo, start: false }).then(async (ipfs) => {
    const filelist = JSON.parse(fs.readFileSync(ipfs_filelist))
    console.log('IPFS CID: ' + filelist[source_dir].hash)

    if (process.env.IPFS_WEBPACK_UPLOAD) {
      if (process.env.IPFS_WEBPACK_ONLINE) {
        console.log('Starting IPFS node up..')
        await ipfs.start()
      }
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
        console.log('Available at https://dev.zippie.com/#dev-content=/permastore2/' + result.path.split('/')[0])
      }

      if (process.env.IPFS_BLOCK_PINNER_ADDRESS) {
        const refs = []

        refs.push({ ref: filelist[source_dir].hash })
        for await (const ref of ipfs.refs(filelist[source_dir].hash, { recursive: true, unique: true })) {
          refs.push(ref)
        }

        const cids = []
        for (k in refs) {
          cids.push(refs[k].ref)
        }
        
        let to_upload = cids
        
        if (process.env.IPFS_BLOCK_PINNER_CHECK_BEFORE) {
           const resp1 = await axios.post(process.env.IPFS_BLOCK_PINNER_ADDRESS + '/check_blocks', cids)
           console.info(resp1.data.unpinned)
           to_upload = resp1.data.unpinned
        }
        
        for (let i = 0; i < to_upload.length; i += 32) {
          const data = new FormData()
          const chunks = to_upload.slice(i, i+32)

          for (let j = 0; j < chunks.length; j++) {
            const ref = chunks[j]
            const block = await ipfs.block.get(ref)
            console.log('adding ' + ref + ' to upload')
            data.append('block', block.data, { filename: ref })
          }

          const resp2 = await axios.post(process.env.IPFS_BLOCK_PINNER_ADDRESS + '/put_signed_blocks', data, { headers: data.getHeaders() })
          console.info('chunk upload status: ' + resp2.status)
        }
      }

      if (process.env.IPFS_WEBPACK_WEB3_NODE && process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY) {
         let web3 = new Web3(process.env.IPFS_WEBPACK_WEB3_NODE)
        
         let account = web3.eth.accounts.wallet.add('0x' + process.env.IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY)
         console.log(account)         
         console.log('Updating contentHash using ' + account.address + ' on ' + process.env.IPFS_WEBPACK_WEB3_NODE + ' registry ' + process.env.IPFS_WEBPACK_ENS_REGISTRY + ' name ' + process.env.IPFS_WEBPACK_ENS_NAME + 
            ' to ' +  filelist[source_dir].hash)
         try { 
           await zippieWeb3Ens.setContenthash(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, process.env.IPFS_WEBPACK_ENS_NAME, "ipfs-ns", filelist[source_dir].hash)
         } catch (err) {
           // we assume there's no resolver
           await zippieWeb3Ens.fifsRegister(web3, process.env.IPFS_WEBPACK_ENS_REGISTRAR, account.address, process.env.IPFS_WEBPACK_ENS_NAME)
           await zippieWeb3Ens.setResolver(web3,  process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, process.env.IPFS_WEBPACK_ENS_NAME, process.env.IPFS_WEBPACK_ENS_RESOLVER)
           // and now try again
           await zippieWeb3Ens.setContenthash(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, process.env.IPFS_WEBPACK_ENS_NAME, "ipfs-ns", filelist[source_dir].hash)
         }
      }
      if (process.env.IPFS_WEBPACK_ONLINE) {
        console.log('Stopping IPFS node... ')
        await ipfs.stop()
      }
    }
    
  })
}

run().then(() => {}).catch((err) => {
  throw err
})