#!/usr/bin/env node
const axios = require('axios')
const IPFS = require('ipfs')
const dotenv = require('dotenv')
const zutils = require('@zippie/zippie-utils')
const fs = require('fs')
const Web3 = require('web3')
const zippieWeb3Ens = require('@zippie/zippie-web3-utils').ens

dotenv.config()


function sendTransaction(web3, tx) {
   return new Promise((resolve, reject) => {
      web3.eth.sendTransaction(tx)
         .on('transactionHash', (hash) => {
         }).on('receipt', (receipt) => {
         }).on('confirmation', (confirmationNumber) => { // (confirmationNumber, receipt) 
            if (confirmationNumber >= 3) {
               resolve();
            }
         })
         .on('error', (err) => { // If a out of gas error, the second parameter is the receipt.
            reject(err);
         })
         .catch((err2) => {
            reject(err);
         });
   });
}

async function run(list) {
   let web3 = new Web3(process.env.IPFS_WEBPACK_WEB3_NODE)
   let acc = web3.eth.accounts.privateKeyToAccount('0x' + process.env.IPFS_WEBPACK_PERMASTORE2_PRIVKEY)
   web3.eth.accounts.wallet.add(acc)

   console.log('High level account ' + acc.address)

   for (var i = 0; i < list.length; i++) {
      let ens_name_from = list[i].from
      let ens_name_to = list[i].to
      let owner = '0x' + list[i].owner

      let account = web3.eth.accounts.privateKeyToAccount(owner)
      web3.eth.accounts.wallet.add(account)

      let balance = await web3.eth.getBalance(account.address)
      if (balance === '0') {
         await sendTransaction(web3, {gas: 26000, from: acc.address, to: account.address, value: web3.utils.toWei('0.01', 'ether')})
      }

      let cid = await zippieWeb3Ens.getContenthashCID(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, ens_name_from)
      let prev_cid
      try {
         prev_cid = await zippieWeb3Ens.getContenthashCID(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, ens_name_to)
      } catch (err) {

      }
      if (prev_cid && cid == prev_cid) {
         console.log('Same CID - no need to update CID for ' + ens_name_to)
         continue
      }
      console.log('Snapshotting ' + ens_name_from + ' to ' + ens_name_to + ' owner' + account.address + 'cid ' + cid)

      try {
         await zippieWeb3Ens.setContenthash(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, ens_name_to, "ipfs-ns", cid)
      } catch (err) {
         // we assume there's no resolver
         await zippieWeb3Ens.fifsRegister(web3, process.env.IPFS_WEBPACK_ENS_REGISTRAR, account.address, ens_name_to)
         await zippieWeb3Ens.setResolver(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, ens_name_to, process.env.IPFS_WEBPACK_ENS_RESOLVER)
         // and now try again
         await zippieWeb3Ens.setContenthash(web3, process.env.IPFS_WEBPACK_ENS_REGISTRY, account.address, ens_name_to, "ipfs-ns", cid)
      }
   }
}

run(JSON.parse(fs.readFileSync(process.argv[2]))).then(() => { }).catch((err) => {
   console.log(err)
   throw err
})
