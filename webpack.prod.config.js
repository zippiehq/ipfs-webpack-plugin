const path = require('path');
const fs = require('fs');
const IpfsWebpackPlugin = require('./index.js')
const BrotliPlugin = require('brotli-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin')
const webpack = require('webpack')

module.exports = {
  mode: 'production',

  entry: {
      boot: __dirname + '/postmsg-proxy-stub.js'
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
      	},
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({sourceMap: true})
    ],
  },
  plugins: [new BrotliPlugin({
			asset: '[path].br[query]',
			test: /\.(js)$/,
			threshold: 10240,
			minRatio: 0.8
		}),
            new IpfsWebpackPlugin()
  ],
  output: {
    filename: 'postmsg-proxy-stub.js',
    path: path.resolve(__dirname, 'build')
  }
}
