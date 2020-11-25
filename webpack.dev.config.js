const path = require('path')
const webpack = require('webpack')

const entry = [
  `webpack-dev-server/client?https://localhost:3000`,
  'webpack/hot/only-dev-server',
];

module.exports = {
  entry: {
    background: [path.join(__dirname, 'src/background/index'), ...entry],
  },
  resolve: {
    extensions: ['*', '.js']
  },
  output: {
    path: path.join(__dirname, '/dist'),
    filename: '[name].bundle.js',
    chunkFilename: '[id].chunk.js',
    publicPath: `https://localhost:3000/`,
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin()
  ],
  devServer: {
    contentBase: './dist',
    hot: true,
    port: 3000,
    https: true
  }
}
