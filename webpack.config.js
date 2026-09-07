const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
  mode: "development",
  entry: {
    main: [
      "./src/js/index.js",
      "./src/js/cms-entry.js",
      "./src/js/blog-teaser.js",
    ],
    admin: "./src/admin/index.jsx",
    blog: "./src/blog/index.js",
  },
  output: {
    filename: "[name].[contenthash:8].js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: { url: { filter: (url) => !url.startsWith("/assets/") } },
          },
          "postcss-loader",
        ],
      },
      {
        test: /\.(?:js|jsx|mjs|cjs)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            targets: "defaults",
            presets: [
              ["@babel/preset-env"],
              ["@babel/preset-react", { runtime: "automatic" }],
            ],
          },
        },
      },
      { test: /\.(woff2?|ttf)$/i, type: "asset/resource" },
    ],
  },
  resolve: { extensions: [".js", ".jsx", ".json"] },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "./src/assets",
          to: "assets",
          globOptions: {
            ignore: [
              "**/objective.webm",
              "**/thinking-no-background.webm",
              "**/introduction/brand-without-background.svg",
              "**/favicon.png",
            ],
          },
        },
        { from: "./src/sitemap.xml" },
        { from: "./src/robots.txt" },
        { from: "./src/google42b90ef871b3befd.html" },
      ],
    }),
    new HtmlWebpackPlugin({
      template: "./src/index.html",
      inject: "body",
      chunks: ["main"],
    }),
    new HtmlWebpackPlugin({
      template: "./src/admin/index.html",
      filename: "admin/index.html",
      chunks: ["admin"],
    }),
    new HtmlWebpackPlugin({
      template: "./src/blog/index.html",
      filename: "blog/template.html",
      chunks: ["blog"],
      minify: false,
    }),
    new MiniCssExtractPlugin({ filename: "[name].[contenthash:8].css" }),
  ],
  devServer: {
    static: "./dist",
    host: "127.0.0.1",
    port: 8080,
    open: false,
    proxy: [
      {
        context: ["/api", "/uploads", "/blog"],
        target: "http://127.0.0.1:3001",
      },
    ],
    historyApiFallback: {
      rewrites: [{ from: /^\/admin/, to: "/admin/index.html" }],
    },
    watchFiles: ["./src"],
  },
  optimization: {
    minimizer: ["...", new CssMinimizerPlugin()],
    minimize: true,
  },
};
