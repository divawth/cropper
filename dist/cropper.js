(function () {

  'use strict';

  var CHECKED_AREA_SIZE = 10;
  var RATIO = window.devicePixelRatio;

  function extend(source, target) {
    var keys = Object.keys(source);
    for (var i = 0, len = keys.length; i < len; i++) {
      var name = keys[ i ];
      target[ name ] = source[ name ];
    }
    return target;
  }

  function drawDashedLine(ctx, startX, startY, endX, endY, dashLength) {

    dashLength = dashLength === undefined ? 2 : dashLength;

    var deltaX = endX - startX;
    var deltaY = endY - startY;
    var numDashes = Math.floor(
      Math.sqrt(deltaX * deltaX + deltaY * deltaY) / dashLength
    );

    for (var i = 0; i < numDashes; ++i) {
      ctx[ i % 2 === 0 ? 'moveTo' : 'lineTo' ](
        startX + (deltaX / numDashes) * i,
        startY + (deltaY / numDashes) * i
      );
    }
    ctx.stroke();

  }

  function drawLine(ctx, startX, startY, endX, endY) {
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  function drawArc(ctx, startX, startY, radius) {
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.closePath();
  }

  function rect(ctx, x, y, w, h, direction) {
    if (direction) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y);
    }
    else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
    }
    ctx.closePath();
  }

  function dataURItoBlob(dataURI) { // 图片转成Buffer
    var byteString = atob(dataURI.split(',')[1]);
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], {type: mimeString});
  }

  function Cropper(options) {
    options.version = '1';
    this.init(options);
  }

  Cropper.prototype = {

    constructor: Cropper,

    dispose: function () {
      var me = this;
      if (me) {
        document.removeEventListener('mousemove', me.handlerMouseMove);
        me.container.removeChild(me.canvas);
        me = null;
      }
    },

    getData: function () {
      return dataURItoBlob(this.imageList[ 0 ]);
    },

    upload: function () {
      var me = this;
      var file = me.getData();
      var data = me.data;
      if (!me.action) {
        throw new Error('must have action');
      }

      var params = new FormData();
      params.append('file', file);
      if (data && typeof(data) == 'object') {
        for (var key in data) {
          params.append(key, data[ key ]);
        }
      }

      return new Promise(function (resolve, reject) {

        var xhr = new XMLHttpRequest();
        xhr.open(
          'post',
          me.action,
          true
        );

        xhr.send(params);
        xhr.onreadystatechange = function () {  // onReadyStateChange 事件
          if (xhr.readyState == 4) {  // 4 为完成
            if (xhr.status == 200) {  // 200 为成功
              resolve(JSON.parse(xhr.responseText));
            }
            else {
              reject(JSON.parse(xhr.responseText));
            }
          }
        };
      });
    },

    refresh: function (x, y, image) {
      var me = this;
      me.ctx.clearRect(0, 0, me.canvasWidth * RATIO, me.canvasHeight * RATIO);

      me.insertImage()
      .then(function () {
        if (image) {
          me.getCropperImage();
        }
        me.drawCropperRect(x, y);
      });
    },

    getCropperImage: function () {
      var me = this;
      var rect = me.boxRect;
      var sizesList = me.sizesList;
      me.imageList = [];

      for (var i = 0; i < sizesList.length; i++) {
        var size = sizesList[ i ];
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = size[ 'width' ] * RATIO;
        canvas.height = size[ 'height' ] * RATIO;

        ctx.drawImage(
          me.image,
          (rect.startX - me.sourceImage.sx) / me.sourceImage.sw * me.image.width,
          (rect.startY - me.sourceImage.sy) / me.sourceImage.sh * me.image.height,
          rect.width / me.sourceImage.sw * me.image.width,
          rect.height / me.sourceImage.sh * me.image.height,
          0,
          0,
          canvas.width,
          canvas.height
        );

        var file = canvas.toDataURL('image/jpg', 1);
        me.imageList[ i ] = file;
        var imageElement = me.imageElement.querySelectorAll('img')[ i ];
        if (imageElement) {
          imageElement.src = file;
          imageElement.style[ 'width' ] = size[ 'width' ] + 'px';
          imageElement.style[ 'height' ] = size[ 'height' ] + 'px';
        }
        else {
          imageElement = document.createElement('img');
          imageElement.src = file;
          imageElement.style[ 'width' ] = size[ 'width' ] + 'px';
          imageElement.style[ 'height' ] = size[ 'height' ] + 'px';
          me.imageElement.append(imageElement);
        }
        
        canvas.remove();
      }

    },

    init: function (options) {

      var me = extend(options, this);
      var imageWrapperClass = options.imageWrapper ? options.imageWrapper : '.view-images';
      me.container = document.querySelector(options.container);
      me.imageElement = document.querySelector(imageWrapperClass);

      if (!me.container) {
        throw new Error('most has container');
      }
      if (!me.imageElement) {
        throw new Error('most has imageElement');
      }

      me.boxWidth = options.boxWidth || options.sizes[ 0 ].width;
      me.sizesList = options.sizes;

      me.radio = 1;
      if (me.sizesList[ 0 ]) {
        me.radio = me.sizesList[ 0 ].width / me.sizesList[ 0 ].height;
      }

      me.insertCanvas();
      me.insertImage()
      .then(function () {
        me.drawCropperRect();
        me.getCropperImage();
      });
      me.bindEvent();

    },  

    isPointInCropperBox: function (x, y) {
      var me = this;
      var rect = me.boxRect;
      var points = rect[ 'points' ];

      if ((rect.startX / RATIO) < x
        && x < ((rect.startX + rect.width) / RATIO)
        && (rect.startY / RATIO) < y
        && y < ((rect.startY + rect.height) / RATIO)
      ) {
        return true;
      }
      return false;
    },

    resizeBox: function (offsetX, offsetY, offsetWidth, offsetHeight) {
      
      offsetX = offsetX * RATIO;
      offsetY = offsetY * RATIO;
      offsetWidth = offsetWidth * RATIO;
      offsetHeight = offsetHeight * RATIO;
      
      var me = this;
      var radio = me.radio;

      var sourceImage = me.sourceImage;
      var boxRect = me.boxRect;
      var boxMaxWidth = sourceImage.sw;
      var boxMaxHeight = sourceImage.sh;
      var boxMaxStartX = sourceImage.sx;
      var boxMaxStartY = sourceImage.sy;

      var boxWidth = boxRect.width + offsetWidth;
      var boxHeight = boxWidth / radio;
      if (offsetHeight && offsetHeight - offsetWidth > 0) {
        boxHeight = boxRect.height + offsetHeight;
        boxWidth = boxHeight * radio;
      }

      // 根据宽高比算出盒子宽高
      boxWidth = boxWidth < CHECKED_AREA_SIZE ? CHECKED_AREA_SIZE : boxWidth;
      if (boxWidth > boxMaxWidth) {
        boxWidth = boxMaxWidth;
        boxHeight = boxWidth / radio;
      }
      if (boxHeight > boxMaxHeight) {
        boxHeight = boxMaxHeight;
        boxWidth = boxHeight * radio;
      }

      var startX = boxRect.startX + offsetX;
      var startY = boxRect.startY + offsetY;

      startX = startX > boxMaxStartX ? startX : boxMaxStartX;
      startY = startY > boxMaxStartY ? startY : boxMaxStartY;

      startX = (startX + boxWidth) > (sourceImage.sx + sourceImage.sw)
        ? sourceImage.sx + sourceImage.sw - boxWidth
        : startX;

      startY = (startY + boxHeight) > (sourceImage.sy + sourceImage.sh)
        ? sourceImage.sy + sourceImage.sh - boxHeight
        : startY;
        
      me.boxRect[ 'startX' ] = startX;
      me.boxRect[ 'startY' ] = startY;
      me.boxRect[ 'width' ] = boxWidth;
      me.boxRect[ 'height' ] = boxHeight;

    },

    bindEvent: function () {
      var me = this;

      me.handlerMouseMove = function (event) {
        var x = event.pageX;
        var y = event.pageY;

        if (me.cursorAction) {
          var deltaX = x - me.startDraggerPos.x;
          var deltaY = y - me.startDraggerPos.y;

          if (me.cursorAction == 'move') {
            me.resizeBox(deltaX, deltaY, 0, 0);
          }
          else if (me.cursorAction == 'se-resize') {
            me.resizeBox(0, 0, deltaX, deltaX);
          }
          else if (me.cursorAction == 'sw-resize') {
            me.resizeBox(deltaX, 0, -deltaX, -deltaX);
          }
          else if (me.cursorAction == 'ne-resize') {
            me.resizeBox(0, -deltaX, deltaX, deltaX);
          }
          else if (me.cursorAction == 'nw-resize') {
            me.resizeBox(deltaX, deltaX, -deltaX, -deltaX);
          }
          me.startDraggerPos = {
            x: x,
            y: y
          };
          me.refresh(0, 0, true);
        }
      };

      me.handlerMouseUp = function (event) {
        if (me.locked) {
          me.canvas.style.cursor = '';
          me.cursorAction = '';
          me.locked = false;
          document.removeEventListener('mousemove', me.handlerMouseMove);

          if (event && me.canvas.style.cursor == 'move') {
            var x = event.pageX;
            var y = event.pageY;
            me.startDraggerPos = {
              x: x,
              y: y
            };
          }
        }
      };

      me.canvas.onmousedown = function (event) {
        if (me.cursorAction) {
          me.startDraggerPos = {
            x: event.pageX,
            y: event.pageY
          };
          me.locked = true;
          document.addEventListener('mousemove', me.handlerMouseMove);
        }
      };

      me.canvas.onmousemove = function (event) {

        var x = event.offsetX;
        var y = event.offsetY;
        var points = me.boxRect[ 'points' ];
        
        if (Math.abs((points[ 3 ].x / RATIO) - x) < CHECKED_AREA_SIZE
          && Math.abs((points[ 3 ].y / RATIO) - y) < CHECKED_AREA_SIZE
        ) {
          if (!me.locked) {
            me.cursorAction = 'se-resize';
          }
        }
        else if (Math.abs((points[ 2 ].x / RATIO) - x) < CHECKED_AREA_SIZE
          && Math.abs((points[ 2 ].y) / RATIO - y) < CHECKED_AREA_SIZE
        ) {
          if (!me.locked) {
            me.cursorAction = 'sw-resize';
          }
        }
        else if (Math.abs((points[ 1 ].x / RATIO) - x) < CHECKED_AREA_SIZE
          && Math.abs((points[ 1 ].y) / RATIO - y) < CHECKED_AREA_SIZE
        ) {
          if (!me.locked) {
            me.cursorAction = 'ne-resize';
          }
        }
        else if (Math.abs((points[ 0 ].x / RATIO) - x) < CHECKED_AREA_SIZE
          && Math.abs((points[ 0 ].y) / RATIO - y) < CHECKED_AREA_SIZE
        ) {
          if (!me.locked) {
            me.cursorAction = 'nw-resize';
          }
        }
        else if (me.isPointInCropperBox(x, y)) {
          if (!me.locked) {
            me.cursorAction = 'move';
          }
        }
        me.canvas.style.cursor = me.cursorAction;
      };

      document.addEventListener('mouseup', me.handlerMouseUp);
    },

    drawCropperRect: function (x, y) {

      var me = this;
      var ctx = me.ctx;
      var CropperColor = '#5C98EA';

      var radio = me.radio;
      var boxWidth = me.boxRect ? me.boxRect.width : me.boxWidth * RATIO;
      var boxHeight = boxWidth * radio;
      var sourceImage = me.sourceImage;

      if (boxWidth > sourceImage.sw) {
        boxWidth = sourceImage.sw;
        boxHeight = boxWidth / radio;
      }
      if (boxHeight > sourceImage.sh) {
        boxHeight = sourceImage.sh;
        boxWidth = boxHeight * radio;
      }
      
      x = x ? RATIO * x : 0;
      y = y ? RATIO * y : 0;

      ctx.lineWidth = 1;
      ctx.strokeStyle = CropperColor;
      ctx.fillStyle = 'transparent';

      var startX = me.boxRect ? me.boxRect.startX + x : sourceImage.sx + ((sourceImage.sw - boxWidth) / 2);
      var startY = me.boxRect ? me.boxRect.startY + y : sourceImage.sy + ((sourceImage.sh - boxHeight) / 2);

      startX = startX > sourceImage.sx ? startX : sourceImage.sx;
      startY = startY > sourceImage.sy ? startY : sourceImage.sy;

      startX = (startX + boxWidth) > (sourceImage.sx + sourceImage.sw)
        ? sourceImage.sx + sourceImage.sw - boxWidth
        : startX;
      startY = (startY + boxHeight) > (sourceImage.sy + sourceImage.sh)
        ? sourceImage.sy + sourceImage.sh - boxHeight
        : startY;
      
      ctx.save();
      // 绘制阴影
      ctx.beginPath();
      rect(ctx, sourceImage.sx, sourceImage.sy, sourceImage.sw, sourceImage.sh);
      rect(ctx, startX, startY, boxWidth, boxHeight, true);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fill();

      me.boxRect = {
        startX: startX,
        startY: startY,
        width: boxWidth,
        height: boxHeight,
        points: [
          {
            x: startX,
            y: startY
          },
          {
            x: (startX + boxWidth),
            y: startY
          },
          {
            x: startX,
            y: (startY + boxHeight)
          },
          {
            x: (startX + boxWidth),
            y: (startY + boxHeight)
          }
        ]
      };

      var points = me.boxRect.points;

      // 绘制图
      drawLine(ctx, startX, startY, (startX + boxWidth), startY);
      drawLine(ctx, (startX + boxWidth), startY, (startX + boxWidth), (startY + boxHeight));
      drawLine(ctx, (startX + boxWidth), (startY + boxHeight), startX, (startY + boxHeight));
      drawLine(ctx, startX, (startY + boxHeight), startX, startY);

      // 绘制九宫格
      ctx.strokeStyle = '#fff';
      drawDashedLine(ctx, startX, (startY + boxHeight / 3), (startX + boxWidth), (startY + boxHeight / 3));
      drawDashedLine(ctx, startX, (startY + boxHeight / 3 * 2), (startX + boxWidth), (startY + boxHeight / 3 * 2));
      drawDashedLine(ctx, (startX + boxWidth / 3), startY, (startX + boxWidth / 3), (startY + boxHeight));
      drawDashedLine(ctx, (startX + boxWidth / 3 * 2), startY, (startX + boxWidth / 3 * 2), (startY + boxHeight));

      // 绘制 4 个点
      ctx.fillStyle = CropperColor;
      for (var i = 0; i < points.length; i++) {
        drawArc(ctx, points[ i ].x, points[ i ].y, 3);
      }
    },

    drawSourceImage: function () {
      var me = this;
      var sourceWidth = me.image.width;
      var sourceHeight = me.image.height;

      var canvasWidth = me.canvasWidth * RATIO - CHECKED_AREA_SIZE;
      var canvasHeight = me.canvasHeight * RATIO - CHECKED_AREA_SIZE;

      if (sourceWidth < canvasWidth
        && sourceHeight < canvasHeight
      ) {
        throw new Error('image is smaller than ' + canvasWidth + '*' + canvasHeight);
      }

      var radio = sourceWidth / sourceHeight;
      if (sourceWidth > canvasWidth) {
        sourceWidth = canvasWidth;
        sourceHeight = sourceWidth / radio;
      }
      if (sourceHeight > canvasHeight) {
        sourceHeight = canvasHeight;
        sourceWidth = sourceWidth * radio;
      }

      var startX = (canvasWidth - sourceWidth + CHECKED_AREA_SIZE) / 2;
      var startY = (canvasHeight - sourceHeight + CHECKED_AREA_SIZE) / 2;
      
      me.ctx.drawImage(
        me.image,
        0,
        0,
        me.image.width,
        me.image.height,
        startX,
        startY,
        sourceWidth,
        sourceHeight
      );

      me.sourceImage = {
        sx: startX,
        sy: startY,
        sw: sourceWidth,
        sh: sourceHeight
      };
    },

    insertImage: function (x, y) {
      var me = this;
      return new Promise(function (resolve) {
        if (me.image) {
          me.drawSourceImage();
          resolve();
          return;
        }
        if (typeof(me.url) == 'string') {
          me.image = new Image();
          me.image.src = me.url;
          me.image.onload = function () {
            me.drawSourceImage();
            resolve();
          };
        }
        else {
          me.image = me.url;
          me.drawSourceImage();
          resolve();
        }
      });
    },

    insertCanvas: function () {

      var me = this;
      var canvasElement = document.createElement('canvas');

      canvasElement.style.width = me.canvasWidth;
      canvasElement.style.height = me.canvasHeight;
      canvasElement.width = me.canvasWidth * RATIO;
      canvasElement.height = me.canvasHeight * RATIO;

      canvasElement.style.backgroundColor = 'transparent';
      canvasElement.style.border = '1px solid #efefec';
      me.container.append(canvasElement); 
      me.container.style.userSelect = 'none';
      me.canvas = canvasElement;
      me.ctx = me.canvas.getContext('2d');

    }

  };

  window.Cropper = Cropper;

})();