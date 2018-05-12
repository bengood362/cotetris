import { want } from '../../unit/';
import event from '../../unit/event';
import actions from '../../actions';
import states from '../states';
import { speeds, delays } from '../../unit/const';
import { music } from '../../unit/music';

const down = (store) => {
  store.dispatch(actions.keyboard.right(true));
  const peerState = store.getState().get('peerConnection');
  const myplayerid = store.getState().get('myplayerid');
  if (peerState.conns) {
    for (let i = 0; i < peerState.conns.length; i++) {
      // later should a sequence number to reorder packet by us
      const data = { label: 'movement', payload: 'right', playerid: myplayerid };
      peerState.conns[i].send(JSON.stringify(data));
    }
  }
  event.down({
    key: 'right',
    begin: 200,
    interval: 100,
    callback: () => {
      const state = store.getState();
      if (state.get('lock')) {
        return;
      }
      if (music.move) {
        music.move();
      }
      let curV;
      if (myplayerid === 0) {
        curV = 'cur';
      } else if (myplayerid === 1) {
        curV = 'cur2';
      } else if (myplayerid === 2) {
        curV = 'curOppo';
      } else if (myplayerid === 3) {
        curV = 'curOppo2';
      }
      const cur = state.get(curV);
      if (cur !== null) {
        if (state.get('pause')) {
          states.pause(false);
          return;
        }
        const next = cur.right();
        const delay = delays[state.get('speedRun') - 1];
        let timeStamp;
        if (want(next, state.get('matrix'))) {
          next.timeStamp += parseInt(delay, 10);
          store.dispatch(actions.moveBlock(next));
          timeStamp = next.timeStamp;
        } else {
          cur.timeStamp += parseInt(parseInt(delay, 10) / 1.5, 10); // 真实移动delay多一点，碰壁delay少一点
          store.dispatch(actions.moveBlock(cur));
          timeStamp = cur.timeStamp;
        }
        const remain = speeds[state.get('speedRun') - 1] - (Date.now() - timeStamp);
        states.auto(remain);
      } else {
        let speed = state.get('speedStart');
        speed = speed + 1 > 6 ? 1 : speed + 1;
        store.dispatch(actions.speedStart(speed));
      }
    },
  });
};

const up = (store) => {
  store.dispatch(actions.keyboard.right(false));
  event.up({
    key: 'right',
  });
};

export default {
  down,
  up,
};
