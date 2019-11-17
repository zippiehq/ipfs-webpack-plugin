# IPFS Webpack Plugin
This plugin simplifies the operation of creating js bundles to be served through IPFS by automatically adding the bundles as part of the webpack build process and injects the applications `<script>` tags to include the bundle CIDs

## Features
 - Automatically adds bundles to local IPFS node
 - Injects `<script>` tags with IPFS Cids
 - CIDHOOK pinning of bundled content
 - Supports brotli compressed bundles
 - `create-react-app` support through `craco`

## Plugin Configuration
Variables through `dotenv`

 - `IPFS_WEBPACK_PLUGIN_NO_GETTER = false` disables the dapp ipfs get bundle function
 - `IPFS_WEBPACK_SWARM_CONNECT = multiaddr` multiaddress to connect to using `swarm.connect`
 - `IPFS_WEBPACK_UPLOAD = true` automatically upload to IPFS
 - `IPFS_WEBPACK_CIDHOOK_PINNER = url` url for CIDHOOKd
 - `IPFS_WEBPACK_CIDHOOK_SECRET = secret` shared secret for CIDHOOKd
 - `IPFS_WEBPACK_CIDHOOK_WAIT = 10000` Timeout in ms for Pin operation
 - `IPFS_WEBPACK_ZIPPIE_PERMASTORE2_PRIVKEY = private_key` Private key for zippie Permastore2 operations

## Dapp Configuration


### Connecting to IPFS

Dapps will automatically connect through an available `window.ipfs` instance through IPFS Companion or you can instantiate your own `js-ipfs` instance through that variable.

The Dapp will also check for running in an iframe for use with `ipfs-postmsg-proxy` to allow sharing of an js-ipfs node between dapps