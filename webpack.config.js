const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: './js/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "./css", to: "dist/css" },
                { from: "./assets", to: "assets" },
            ],
        }),
        new HtmlWebpackPlugin({
            template: './index.html',
            favicon: './assets/home/brand.svg',
        })
    ],
    devServer: {
        static: './dist',
        open: true,
        watchFiles: ['./index.html', './src'], 
    },
};