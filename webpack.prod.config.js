const path = require('path')
const TerserPlugin = require("terser-webpack-plugin")
var Crx = require("crx-webpack-plugin")

module.exports = {
  entry: {
    background: [path.join(__dirname, 'src/background/index')],
  },
  resolve: {
    extensions: ['*', '.js']
  },
  output: {
    path: path.join(__dirname, '/dist'),
    filename: '[name].bundle.js',
    chunkFilename: '[id].chunk.js',
  },
  plugins: [
    new Crx({
      keyFile: 'key.pem',
      contentPath: 'dist',
      outputPath: 'ctx',
      name: 'gcp-shortcuts'
    })
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  }
}