import React from 'react';
import propTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Peerjs from 'peerjs';
import store from '../../store';
import actions from '../../actions';
import * as reducerType from '../../unit/reducerType';


export default class Peer extends React.Component {
  constructor() {
    super();
    this.state = {
      currentplayerid: 0,
      id: '',
      opp: '',
      conns: [],
      peer: null,
    };
    this.register = this.register.bind(this);
    this.connect = this.connect.bind(this);
    this.regClick = this.regClick.bind(this);
    this.connClick = this.connClick.bind(this);
  }
  componentWillMount() {
    this.onChange(this.props);
  }
  componentWillReceiveProps(nextProps) {
    this.onChange(nextProps);
  }
  shouldComponentUpdate({ cur, point, max }) {
    const props = this.props;
    return cur !== props.cur || point !== props.point || max !== props.max || !props.cur;
  }
  onChange(a) {
    return a != null;
  }
  register(id) {
    const peer = new Peerjs(id, {
      host: 'localhost',
      port: 9000,
      path: '/',

      // Set highest debug level (log everything!).
      debug: 3,
    });
    console.log('Peer', peer);
    store.dispatch(actions.peerSavePeer(peer));
    this.setState({
      id,
      peer,
    }, () => {
      this.state.peer.on('connection', (c) => {
        c.on('open', () => {
          console.log('someone connected.');
          this.setState({ conns: [...this.state.conns, c] });
          // payload is player's id
          const lastPlayer = this.state.currentplayerid + 1;
          this.setState({ lastPlayer });
          c.send(JSON.stringify({ label: 'header', flag: 'ACK', payload: lastPlayer }));
          c.on('data', (data) => { // NOTE please copy bottom code to here too
            alert(data);
            console.log(data);
          });
          c.on('close', () => {
            c.close();
            console.log(`${c.peer} has left the chat.`);
          });
        });
      });
    });
  }

  connect(id) {
    this.setState({
      opp: id,
    });
    const con = this.state.peer.connect(id, {
      label: 'chat',
      serialization: 'none',
      metadata: {
        message: 'hi i want to chat with you!',
      },
    });
    const stateConns = store.getState().peerConnection.conn;
    const connsCopy = stateConns.slice();
    connsCopy.push(con);
    store.dispatch(actions.peerSaveConnection(connsCopy));
    this.setState({ conns: [...this.state.conns, con] });
    con.on('open', () => {
      con.on('data', (res) => {
        console.log(res);
        const data = JSON.parse(res);
        const storeStates = store.getState();
        if (data.label === 'header') {
          if (data.flag === 'ACK') {
            const myplayerid = data.payload;
            store.dispatch(actions.setMyPlayerID(myplayerid));
            console.log('connect success.');
          }
        } else if (data.label === 'movement') {
          const playerid = data.playerid;
          let type; let cur;
          if (playerid === 0) {
            type = reducerType.MOVE_BLOCK;
            cur = storeStates.cur;
          } else if (playerid === 1) {
            type = reducerType.MOVE_BLOCK2;
            cur = storeStates.cur2;
          } else if (playerid === 2) {
            type = reducerType.MOVE_BLOCK_OPPO;
            cur = storeStates.curOppo;
          } else if (playerid === 2) {
            type = reducerType.MOVE_BLOCK_OPPO2;
            cur = storeStates.curOppo2;
          }
          console.log(type, cur);
          const direction = data.payload;
          if (direction === 'left') {
            store.dispatch(actions.moveBlockGeneral(cur.left(), type));
          } else if (direction === 'right') {
            store.dispatch(actions.moveBlockGeneral(cur.right(), type));
          } else if (direction === 'rotate') {
            store.dispatch(actions.moveBlockGeneral(cur.rotate(), type));
          }
        }
      });
      con.on('close', () => {
        con.close();
        console.log(`${con.peer} has left the chat.`);
      });
    });
    con.on('error', (err) => {
      console.log(err);
    });
  }

  regClick() {
    if (this.modal && this.modal.value) {
      this.register(this.modal.value);
    }
    console.log(this.state.peer, this.state.conns);
  }

  connClick() {
    if (this.modal2 && this.modal2.value) {
      this.connect(this.modal2.value);
    }
  }

  render() {
    // console.log(JSON.stringify(this.state.conn));
    return (
      <div>
        <p>Peerjs in use</p>
        <p>myid: { this.state.id }</p>
        <p>oppid: { this.state.opp }</p>
        <p>Choose an ID:
          <input id="myid" type="text" ref={(m) => { this.modal = m; }} />
          <button onClick={this.regClick}>Register</button>
        </p>
        <p>Connect to an ID:
          <input id="oppid" type="text" ref={(m) => { this.modal2 = m; }} />
          <button onClick={this.connClick}>Connect</button>
        </p>
        <Link
          to={{
            pathname: '/tetris',
          }}
        >Home</Link>
      </div>
    );
  }
}

Peer.statics = {
  timeout: null,
};

Peer.propTypes = {
  cur: propTypes.bool,
  max: propTypes.number,
  point: propTypes.number,
};

