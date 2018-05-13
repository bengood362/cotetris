import { blockType, StorageKey, StorageHold } from './const';

const hiddenProperty = (() => { // document[hiddenProperty] 可以判断页面是否失焦
  let names = [
    'hidden',
    'webkitHidden',
    'mozHidden',
    'msHidden',
  ];
  names = names.filter((e) => (e in document));
  return names.length > 0 ? names[0] : false;
})();

const visibilityChangeEvent = (() => {
  if (!hiddenProperty) {
    return false;
  }
  return hiddenProperty.replace(/hidden/i, 'visibilitychange'); // 如果属性有前缀, 相应的事件也有前缀
})();

const isFocus = () => {
  if (!hiddenProperty) { // 如果不存在该特性, 认为一直聚焦
    return true;
  }
  return !document[hiddenProperty];
};

const unit = {
  getNextType(type) { // 随机获取下一个方块类型
    if (type === undefined) {
      const len = blockType.length - 1;
      return blockType[Math.floor(Math.random() * len)];
    }
    return blockType[type];
  },
  want(next, matrix) { // 方块是否能移到到指定位置
    const xy = next.xy;
    const shape = next.shape;
    return shape.every((m) => {
      if (xy[1] + m.get(0) < 0) { // left
        return false;
      }
      if (xy[1] + m.get(0) >= 10) { // right
        return false;
      }
      if (xy[0] + m.get(1) < 0) { // top
        return true;
      }
      if (xy[0] + m.get(1) >= 20) { // bottom
        return false;
      }
      if (matrix.get(xy[0] + m.get(1)).get(xy[1] + m.get(0))) {
        return false;
      }
      return true;
    });
  },
  isClear(matrix) { // 是否达到消除状态
    const clearLines = [];
    matrix.forEach((m, k) => {
      if (m.every(n => !!n)) {
        clearLines.push(k);
      }
    });
    if (clearLines.length === 0) {
      return false;
    }
    return clearLines;
  },
  isOver(matrix) { // 游戏是否结束, 第一行落下方块为依据
    return matrix.get(0).some(n => !!n);
  },
  subscribeRecord(store) { // 将状态记录到 localStorage
    store.subscribe(() => {
      let data = store.getState().toJS();
      if (data.lock) { // 当状态为锁定, 不记录
        return;
      }
      data = JSON.stringify(data);
      data = encodeURIComponent(data);
      if (window.btoa) {
        data = btoa(data);
      }
      localStorage.setItem(StorageKey, data);
    });
  },
  subscribeTile(store) { // 将状态记录到 localStorage
    store.subscribe(() => {
      let data = store.getState().toJS();
      if (data.lock) {
        return;
      }
      data = JSON.stringify(data);
      data = encodeURIComponent(data);
      if (window.btoa) {
        data = btoa(data);
      }
      localStorage.setItem(StorageHold, data);
    });
  },
  isMobile() { // 判断是否为移动端
    const ua = navigator.userAgent;
    const android = /Android (\d+\.\d+)/.test(ua);
    const iphone = ua.indexOf('iPhone') > -1;
    const ipod = ua.indexOf('iPod') > -1;
    const ipad = ua.indexOf('iPad') > -1;
    const nokiaN = ua.indexOf('NokiaN') > -1;
    return android || iphone || ipod || ipad || nokiaN;
  },
  visibilityChangeEvent,
  isFocus,
};

module.exports = unit;
