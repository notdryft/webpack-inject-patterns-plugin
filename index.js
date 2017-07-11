const ejs = require('ejs');
const fs = require('fs');

function InjectPlugin(options) {
  this.options = options || {};
  this.options.patterns = Object.assign({}, {
    inline: function (content) {
      return content;
    },
    name: function (filename) {
      return filename;
    },
    script: function (asset) {
      return `<script type="text/javascript" src="${asset}"></script>`;
    },
    template: function (renderer, content, parameters) {
      return renderer.render(content, parameters);
    }
  }, this.options.patterns || {});

  const selectors = Object.keys(this.options.patterns).join('|');
  this.options.pattern = new RegExp(`(?:<!--|\\/\\*) ?(${selectors}):([a-z]+\\.[a-z]+)\\??([^ ]+)? ?(?:-->|\\*\\/)`, 'i');
}

InjectPlugin.prototype.apply = function (compiler) {
  const me = this;

  compiler.plugin('emit', function (compilation, callback) {
    const assets = {};

    compilation.chunks.reduce(function (acc, chunk) {
      return chunk.files.reduce(function (acc, file) {
        if (file.includes('hot-update')) {
          return acc;
        }

        if (file.endsWith('js')) {
          acc[chunk.name + '.js'] = file;
        } else if (file.endsWith('css')) {
          acc[chunk.name + '.css'] = file;
        }

        return acc;
      }, acc);
    }, assets);

    if (me.options.files) {
      me.options.files.forEach(function (file) {
        if (compilation.assets[file]) {
          let source = compilation.assets[file].source();
          if (Buffer.isBuffer(source)) {
            source = source.toString();
          }

          let injects;
          while (injects = me.options.pattern.exec(source)) {
            const selector = injects[0];
            const type = injects[1];
            const asset = injects[2];
            const fn = me.options.patterns[type];

            if (type === 'inline') {
              const content = fs.readFileSync(`${me.options.context}/${asset}`, 'utf8');
              source = source.replace(selector, content);
            } else if (type === 'name' || type === 'script') {
              source = source.replace(selector, fn(assets[asset]));
            } else if (type === 'template') {
              const query = injects[3];
              const parameters = query.split('&').reduce(function (acc, parameter) {
                const split = parameter.split('=');
                acc[split[0]] = split[1];
                return acc;
              }, {});

              const content = fs.readFileSync(`${me.options.context}/${asset}`, 'utf8');
              source = source.replace(selector, fn(ejs, content, parameters));
            } else {
              source = source.replace(selector, '');
            }
          }

          source = new Buffer(source);
          const size = Buffer.byteLength(source);

          compilation.assets[file] = {
            source: function () {
              return source;
            },
            size: function () {
              return size;
            }
          }
        }
      });
    }

    callback();
  });
};

module.exports = InjectPlugin;
