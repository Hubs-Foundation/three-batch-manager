const path = require("path");
const HTMLWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    index: path.join(__dirname, "index.ts"),
    "basic-image-batching": path.join(__dirname, "basic-image-batching.ts")
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js"
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader" }]
  },
  devServer: {
    contentBase: path.resolve(__dirname, "public")
  },
  plugins: [
    new HTMLWebpackPlugin({
      filename: "index.html",
      template: path.join(__dirname, "index.html"),
      chunks: ["index"]
    }),
    new HTMLWebpackPlugin({
      filename: "basic-image-batching.html",
      template: path.join(__dirname, "basic-image-batching.html"),
      chunks: ["basic-image-batching"]
    }),
    new webpack.ProvidePlugin({
      THREE: "three"
    })
  ]
};
