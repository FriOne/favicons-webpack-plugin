'use strict';

var _ = require('lodash');
var loaderUtils = require('loader-utils');
var favicons = require('favicons/es5');
var faviconPersitenceCache = require('./cache');

module.exports = function (content) {
  var self = this;
  self.cacheable && this.cacheable();
  if (!self.emitFile) throw new Error('emitFile is required from module system');
  if (!self.async) throw new Error('async is required');

  var callback = self.async();
  var query = loaderUtils.parseQuery(self.query);
  var pathPrefix = loaderUtils.interpolateName(self, query.outputFilePrefix, {
    context: query.context || this.options.context,
    content: content,
    regExp: query.regExp
  });
  var fileHash = loaderUtils.interpolateName(self, '[hash]', {
    context: query.context || this.options.context,
    content: content,
    regExp: query.regExp
  });
  var cacheFile = pathPrefix + '.cache';
  faviconPersitenceCache.loadIconsFromDiskCache(self, query, cacheFile, fileHash, function (err, cachedResult) {
    if (err) return callback(err);
    if (cachedResult) {
      return callback(null, 'module.exports = ' + JSON.stringify(cachedResult));
    }
    // Generate icons
    generateIcons(self, content, pathPrefix, query, function (err, iconResult) {
      if (err) return callback(err);
      faviconPersitenceCache.emitCacheInformationFile(self, query, cacheFile, fileHash, iconResult);
      callback(null, 'module.exports = ' + JSON.stringify(iconResult));
    });
  });
};

function getPublicPath (compilation) {
  var publicPath = compilation.outputOptions.publicPath || '';
  if (publicPath.length && publicPath.substr(-1) !== '/') {
    publicPath += '/';
  }
  return publicPath;
}

function generateIcons (loader, imageFileStream, pathPrefix, query, callback) {
  var publicPath = getPublicPath(loader._compilation);
  favicons(imageFileStream, {
    path: '',
    url: '',
    icons: query.icons,
    background: query.background,
    appName: query.appName
  }, function (err, result) {
    if (err) return callback(err);
    var html = result
      .html
      .map(function (entry) {
        return entry.replace(/(href=[""])/g, '$1' + publicPath + pathPrefix);
      });
    var loaderResult = {
      outputFilePrefix: pathPrefix,
      html: html,
      files: []
    };
    result.images.forEach(function (image) {
      loaderResult.files.push(pathPrefix + image.name);
      loader.emitFile(pathPrefix + image.name, image.contents);
    });
    result.files.forEach(function (file) {
      var filePath = pathPrefix + file.name;
      if ('manifest.json' === file.name) {
        try {
          var currentManifest = JSON.parse(file.contents);
          var newManifest = _.assign(currentManifest, query.manifest);
          delete query.manifest.icons;
          file.contents = JSON.stringify(newManifest, null, 4);
        }
        catch (error) {
          loader.emitError('Error merging manifest.json data\n' + error);
        }
      }
      loaderResult.files.push(filePath);
      loader.emitFile(filePath, file.contents);
    });
    callback(null, loaderResult);
  });
}

module.exports.raw = true;
