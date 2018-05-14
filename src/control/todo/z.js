import { want } from '../../unit/';
import event from '../../unit/event';
import actions from '../../actions';
import states from '../states';
import { music } from '../../unit/music';
import * as reducerType from '../../unit/reducerType';

const down = (store) => {
  store.dispatch(actions.keyboard.z(true));
  const peerState = store.getState().get('peerConnection');
  const myplayerid = store.getState().get('myplayerid');
  if (peerState.conns) {
    for (let i = 0; i < peerState.conns.length; i++) {
      // later should a sequence number to reorder packet by us
      const data = { label: 'movement', payload: 'rotate', playerid: myplayerid };
      peerState.conns[i].send(JSON.stringify(data));
    }
  }
  let curV;
  let curV2;
  let tmpMatrix;
  let type;
  let type2;
  if (myplayerid === 0) {
    curV = 'cur';
    curV2 = 'cur2';
    tmpMatrix = 'tempMatrix';
    type = reducerType.MOVE_BLOCK;
    type2 = reducerType.MOVE_BLOCK2;
  } else if (myplayerid === 1) {
    curV = 'cur2';
    curV2 = 'cur';
    tmpMatrix = 'tempMatrix';
    type = reducerType.MOVE_BLOCK2;
    type2 = reducerType.MOVE_BLOCK;
  } else if (myplayerid === 2) {
    curV = 'curOppo';
    curV2 = 'curOppo2';
    tmpMatrix = 'tempMatrix2';
    type = reducerType.MOVE_BLOCK_OPPO;
    type2 = reducerType.MOVE_BLOCK_OPPO2;
  } else if (myplayerid === 3) {
    curV = 'curOppo2';
    curV2 = 'curOppo';
    tmpMatrix = 'tempMatrix2';
    type = reducerType.MOVE_BLOCK_OPPO2;
    type2 = reducerType.MOVE_BLOCK_OPPO;
  }
  if (store.getState().get(curV) !== null) {
    event.down({
      key: 'z',
      once: true,
      callback: () => {
        const state = store.getState();
        if (state.get('lock')) {
          return;
        }
        if (state.get('pause')) {
          states.pause(false);
        }
        const cur = state.get(curV);
        const cur2 = state.get(curV2);
        if (cur === null) {
          return;
        }
        if (music.rotate) {
          music.rotate();
        }
        let next;
        for (let i = 0; i < 5; i++) {
          next = cur.z(i);
          const xy = next.xy;
          const xy2 = cur2.xy;
          if (want(next, state.get('matrix'))) {
            let tMatrix = state.get(tmpMatrix);
            const tshape = cur2 && cur2.shape;
            const txy = cur2 && cur2.xy;
            tshape.forEach((m) => {
              if (txy.get(0) + m.get(1) >= 0) { // 竖坐标可以为负
                let line = tMatrix.get(txy.get(0) + m.get(1));
                line = line.set(txy.get(1) + m.get(0), 1);
                tMatrix = tMatrix.set(txy.get(0) + m.get(1), line);
              }
            });
            if (want(next, tMatrix)) {
              store.dispatch(actions.moveBlockGeneral(next, type));
              store.dispatch(actions.resetLockDelay());
            }
            if (!want(next, tMatrix)) {
              console.log(xy.get(1));
              console.log(xy2.get(1));
              if (xy.get(1) < xy2.get(1) && want(cur2.right(), state.get(tmpMatrix))) {
                store.dispatch(actions.moveBlockGeneral(cur2.right(), type2));
                store.dispatch(actions.moveBlockGeneral(next, type));
                store.dispatch(actions.resetLockDelay());
              } else if (xy.get(1) > xy2.get(1) && want(cur2.left(), state.get(tmpMatrix))) {
                store.dispatch(actions.moveBlockGeneral(cur2.left(), type2));
                store.dispatch(actions.moveBlockGeneral(next, type));
                store.dispatch(actions.resetLockDelay());
              }
            }
            break;
          }
        }
      },
    });
  }
};

const up = (store) => {
  store.dispatch(actions.keyboard.z(false));
  event.up({
    key: 'z',
  });
};

export default {
  down,
  up,
};
