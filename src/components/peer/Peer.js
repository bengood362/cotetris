import React from 'react';
import PropTypes from 'prop-types';
import { customAlphabet } from 'nanoid';
import * as R from 'ramda';

import { List } from 'immutable';

// Data Model
import Member from '../../model/Member';
import Team from '../../model/Team';

// Protocol
import {
    PROTOCOL as CONNECTION_PROTOCOL,
    MessageTypes as ConnectionMessageTypes,

    createConnectToUserMessage,
    createAckConnectToUserMessage,
    createRequestConnectionInfoMessage,
    createResponseConnectionInfoMessage,
    createJoinLobbyMessage,
    createAckJoinLobbyMessage,

    createAssignTeamMessage, // eslint-disable-line no-unused-vars
    createAckAssignTeamMessage, // eslint-disable-line no-unused-vars
    createChooseTeamMessage, // eslint-disable-line no-unused-vars
    createAckChooseTeamMessage, // eslint-disable-line no-unused-vars

    createToggleReadyMessage,
    createInitGameMessage, // eslint-disable-line no-unused-vars
    createAckInitGameMessage, // eslint-disable-line no-unused-vars

    createPingMessage,
    createPongMessage,
} from '../../protocol/Connection';
import { initConnection, initPeerJsClient } from '../../utils/peerJsUtils';

// Components
import Lobby from './Lobby';
import PeerJsUserRegisterForm from './PeerJsUserRegisterForm';
import PeerJsConfigForm from './PeerJsConfigForm';

import styles from './index.less';

// Store & actions
import store from '../../store';
import todo from '../../control/todo';
import actions from '../../actions';

import * as reducerType from '../../unit/reducerType';

const memberIdCharacterSet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const memberNanoid = customAlphabet(memberIdCharacterSet, 24)
const MAX_RETRY_COUNT = 5; // 0, 500, 1500, 4500, 13500, 15000
const RETRY_COEFF = 3;
const RETRY_BASE = 500;
const MESSAGE_RETRY_CAP = 15000;
const FETCH_CONNECTION_INFO_INTERVAL = 10000;
const MessageState = {
    // Also NOT_EXISTS
    RECEIVED: 20,
    FINISHED: 30,
};

// output: { teamId1: [memberId1, memberId2], teamId2: [], null: [...]}
function deriveTeamMemberIds(memberLookup, teamLookup) {
    const members = R.values(memberLookup);
    const getMembersInTeam = (team) => R.filter(R.propEq('teamId', R.prop('id', team)), members);
    const teamMemberLookup = R.map(getMembersInTeam, teamLookup);

    return R.map(R.map(R.prop('id')), teamMemberLookup);
}

export default class Peer extends React.Component {
    static propTypes = {
        history: PropTypes.object,
        cur: PropTypes.bool,
        max: PropTypes.number,
        point: PropTypes.number,

        onRegister: PropTypes.func.isRequired,
        // onSaveTeamInfo: PropTypes.func.isRequired,
        // onSaveConnectionLookup: PropTypes.func.isRequired,

        showReduxConnectionInfo: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);

        // TODO: GC Finished state later
        this._messageStateLookup = {};
        this._messageRetryCountLookup = {};
        this._fetchConnectionInfoTimer = null;
        this._peerJsClient = null;
        this._connectionLookup = {};

        const team1 = new Team('1', '#ccffcc', []);
        const team2 = new Team('2', '#ccccff', []);

        this.state = {
            peerJsConfig: {
                host: 'localhost',
                port: 9000,
                path: '/cotetris',

                // Set highest debug level (log everything!).
                debug: 3,
            },

            isHosting: false,
            myId: '',
            displayName: '',
            lobbyMemberIds: [],

            errorMessage: '',
            memberLookup: {},
            teamLookup: {
                [team1.id]: team1,
                [team2.id]: team2,
            },
        };

        // TODO: heartbeat to connection and reconnect if needed
    }

    componentWillUnmount() {
        if (this._fetchConnectionInfoTimer) {
            clearInterval(this._fetchConnectionInfoTimer);
        }
    }

    // legacy codes !?!?!?!
    shouldComponentUpdate({ cur, point, max }) {
        const props = this.props;

        return cur !== props.cur || point !== props.point || max !== props.max || !props.cur;
    }

    _updateTeamId = (targetTeamId, targetMemberId) => {
        return new Promise((resolve) => {
            this.setState((state) => {
                // Update Member
                const targetMember = state.memberLookup[targetMemberId];
                const newMember = Member.setTeamId(targetTeamId, targetMember);
                const memberLookupUpdater = (memberLookup) => R.set(R.lensProp(targetMemberId), newMember, memberLookup);
                const newMemberLookup = memberLookupUpdater(state.memberLookup);

                // Update Team Member Ids
                const teamLookupEvolver = R.map(Team.setTeamMembers(R.__), deriveTeamMemberIds(newMemberLookup, state.teamLookup));
                const newTeamLookup = R.evolve(teamLookupEvolver, state.teamLookup);

                return {
                    memberLookup: newMemberLookup,
                    teamLookup: newTeamLookup,
                };
            }, resolve);
        });
    }

    // DEBUG
    showAllConnection = () => {
        const { myId, lobbyMemberIds, memberLookup, teamLookup } = this.state;

        console.log('this._connectionLookup', this._connectionLookup);
        console.log('memberLookup', memberLookup);
        console.log('teamLookup', teamLookup);
        console.log('myId', myId);
        console.log('lobbyMemberIds', lobbyMemberIds);
    }

    sendPingMessageToAllConnection = () => {
        const { myId } = this.state;

        for (let connectionId in this._connectionLookup) {
            const messageToSend = createPingMessage(myId);

            this._connectionLookup[connectionId].send(messageToSend);
        }
    }

    /**
     * PeerJs connections
     *  */
    _broadcastConnectionInfo = () => {
        const { myId, lobbyMemberIds, memberLookup, teamLookup } = this.state;

        for (let memberId of lobbyMemberIds) {
            if (myId !== memberId) {
                // TODO: optimization: remove sending lookup everytime, maybe only transient user state

                console.log('teamLookup', teamLookup);
                console.log('memberLookup', memberLookup);

                const messageToSend = createResponseConnectionInfoMessage(myId, {
                    teamLookup: teamLookup,
                    memberLookup: memberLookup,
                    lobbyMemberIds,
                });

                const targetConnection = this._connectionLookup[memberId];

                console.assert(targetConnection, 'targetConnection must exists', { myId, targetId: memberId });

                targetConnection.send(messageToSend);
            }
        }
    }

    _setMessageFinished = (message) => {
        const { uniqueId } = message;

        this._messageStateLookup[uniqueId] = MessageState.FINISHED;
    }

    _retryMessage = (message) => {
        const { uniqueId } = message;
        const retryCount = this._messageRetryCountLookup[uniqueId];
        const retryTimeout = Math.min(MESSAGE_RETRY_CAP, RETRY_BASE * Math.pow(RETRY_COEFF, retryCount + 1));
        const messageState = this._messageStateLookup[uniqueId];

        this._messageRetryCountLookup[uniqueId]++;

        // TODO: create state machine library and fire by trigger later
        if (messageState !== MessageState.FINISHED && retryCount < MAX_RETRY_COUNT) {
            setTimeout(() => this._handlePeerJsMessage(message), retryTimeout);
        } else if (messageState !== MessageState.FINISHED && retryCount >= MAX_RETRY_COUNT) {
            console.error('Message retried and failed', { message });
        }
    }

    _handlePeerJsClientOpen = (myId, isHosting) => {
        const { peerJsConfig } = this.state;

        this.props.onRegister(myId, isHosting, peerJsConfig);
    }

    _handlePeerJsClientClose = (err) => {
        this.setState((state) => ({
            errorMessage: `${state.errorMessage}\nPeerjs client close, please refresh`,
        }));
    }

    // TODO: handle error
    _handlePeerJsClientError = (err) => {
        this.setState({ errorMessage: `${err.message} ${err.stack}` });
    }

    _handlePeerJsDataConnectionOpen = (connection) => {
        if (this._connectionLookup[connection.peer]) {
            this._handlePeerJsDataConnectionError(new Error(`connection for id ${connection.peer} exists`));

            return;
        }

        this._connectionLookup[connection.peer] = connection;
    }

    // TODO: handle error
    _handlePeerJsDataConnectionError = (err, connection) => {
        this.setState({ errorMessage: `${err.message} ${err.stack}` });
    }
    _handlePeerJsDataConnectionClose = (connection) => {
        const connectionIdToDrop = connection.peer;
        const { isHosting } = this.state;

        delete this._connectionLookup[connectionIdToDrop];

        let newStateEvolver = {
            memberLookup: (memberLookup) => (R.dissoc(connectionIdToDrop, memberLookup)),
            errorMessage: (errorMessage) => (`${errorMessage}\nConnection ${connection.peer} close, please refresh`),
        };

        if (isHosting) {
            newStateEvolver['lobbyMemberIds'] = (lobbyMemberIds) => R.reject(R.equals(connectionIdToDrop), lobbyMemberIds);
        }

        this.setState((state) => (R.evolve(newStateEvolver, state)));
    }
    _handlePeerJsMessage = (message, connection) => {
        const { protocol, type, uniqueId, from: messageFrom } = message;
        const myplayerid = store.getState().get('myplayerid');

        if (connection.peer !== messageFrom) {
            console.error('_handlePeerJsMessage: Spoofed as message sender', {
                'connection.peer': connection.peer,
                messageFrom,
            });

            this._setMessageFinished(message);

            return;
        }

        if (this._messageStateLookup[uniqueId] === MessageState.FINISHED) {
            console.error('_handlePeerJsMessage: message already resolved', { uniqueId });

            return;
        }

        if (protocol === CONNECTION_PROTOCOL) {
            if (type === ConnectionMessageTypes.CONNECT_TO_USER) {
                this._handleConnectToUser(message, connection);
            } else if (type === ConnectionMessageTypes.ACK_CONNECT_TO_USER) {
                this._handleAckConnectToUser(message, connection);
            } else if (type === ConnectionMessageTypes.REQUEST_CONNECTION_INFO) {
                this._handleRequestConnectionInfo(message);
            } else if (type === ConnectionMessageTypes.RESPONSE_CONNECTION_INFO) {
                this._handleResponseConnectionInfo(message);
            } else if (type === ConnectionMessageTypes.JOIN_LOBBY) {
                this._handleJoinLobby(message);
            } else if (type === ConnectionMessageTypes.ACK_JOIN_LOBBY) {
                this._handleAckJoinLobby(message);
            } else if (type === ConnectionMessageTypes.PING) {
                this._handlePing(message);
            } else if (type === ConnectionMessageTypes.PONG) {
                this._handlePong(message);
            } else if (type === ConnectionMessageTypes.TOGGLE_READY) {
                this._handleToggleReady(message);
            } else if (type === ConnectionMessageTypes.CHOOSE_TEAM) {
                this._handleChooseTeam(message);
            } else if (type === ConnectionMessageTypes.ACK_CHOOSE_TEAM) {
                this._handleAckChooseTeam(message);
            }
        } else if (message.label === 'syncmove') {
            todo[message.key].down(store, message.id);
            todo[message.key].up(store);
        } else if (message.label === 'linesSent') {
            if (message.team === ((myplayerid <= 1) ? 'LEFT' : 'RIGHT')) {
                store.dispatch({ type: reducerType.LINES_RECEIVED, data: message.data });
            }
        } else if (message.label === 'syncgame') {
            if (message.team === ((myplayerid <= 1) ? 'LEFT' : 'RIGHT')) {
                if (message.attr === 'matrix') {
                    // console.log('matrix');
                    let newMatrix = List();

                    message.data.forEach((m) => {
                        newMatrix = newMatrix.push(List(m));
                    });
                    store.dispatch(actions.matrix(newMatrix));
                } else if (message.attr === 'cur2') {
                    // console.log('cur2');
                    const newCur = message.data;
                    let newShape = List();

                    newCur.shape.forEach((m) => {
                        newShape = newShape.push(List(m));
                    });

                    const next = {
                        shape: newShape,
                        type: newCur.type,
                        xy: newCur.xy,
                        rotateIndex: newCur.rotateIndex,
                        timeStamp: newCur.timeStamp,
                    };

                    // console.log(next);
                    store.dispatch(actions.moveBlock2(next));
                } else if (message.attr === 'cur') {
                    const newCur = message.data;
                    let newShape = List();

                    newCur.shape.forEach((m) => {
                        newShape = newShape.push(List(m));
                    });

                    const next = {
                        shape: newShape,
                        type: newCur.type,
                        xy: newCur.xy,
                        rotateIndex: newCur.rotateIndex,
                        timeStamp: newCur.timeStamp,
                    };

                    // console.log(next);
                    store.dispatch(actions.moveBlock(next));
                }
            } else if (message.team !== ((myplayerid <= 1) ? 'LEFT' : 'RIGHT')) {
                if (message.attr === 'matrix') {
                    // console.log('matrix');
                    let newMatrix = List();

                    message.data.forEach((m) => {
                        newMatrix = newMatrix.push(List(m));
                    });
                    store.dispatch(actions.matrixOppo(newMatrix));
                } else if (message.attr === 'cur2') {
                    // console.log('cur2');
                    const newCur = message.data;
                    let newShape = List();

                    newCur.shape.forEach((m) => {
                        newShape = newShape.push(List(m));
                    });

                    const next = {
                        shape: newShape,
                        type: newCur.type,
                        xy: newCur.xy,
                        rotateIndex: newCur.rotateIndex,
                        timeStamp: newCur.timeStamp,
                    };

                    // console.log(next);
                    store.dispatch(actions.moveBlockOppo2(next));
                } else if (message.attr === 'cur') {
                    const newCur = message.data;
                    let newShape = List();

                    newCur.shape.forEach((m) => {
                        newShape = newShape.push(List(m));
                    });

                    const next = {
                        shape: newShape,
                        type: newCur.type,
                        xy: newCur.xy,
                        rotateIndex: newCur.rotateIndex,
                        timeStamp: newCur.timeStamp,
                    };

                    // console.log(next);
                    store.dispatch(actions.moveBlockOppo(next));
                }
            }
        }
    }
    _handlePeerJsDataConnectionData = (data, connection) => {
        const message = JSON.parse(data);
        const { protocol, type, from: messageFrom, uniqueId } = message;

        // TODO: verify for other protocol
        // Verify message shape
        if (protocol === CONNECTION_PROTOCOL) {
            if (!type || !protocol || !messageFrom || !uniqueId) {
                this.setState({ errorMessage: 'message does not fit protocol' });

                return;
            }
        }

        // Verify message arrival
        if (this._messageStateLookup[uniqueId]) {
            // message received already
            console.error('Message with same unique ID arrived', {
                uniqueId,
                message,
            });

            return;
        }

        this._messageStateLookup[uniqueId] = MessageState.RECEIVED;
        this._messageRetryCountLookup[uniqueId] = 0;
        // Finish Verify message arrival

        const targetConnection = this._connectionLookup[messageFrom];

        // Verify connection ID
        if (targetConnection) {
            console.assert(targetConnection.peer === messageFrom, '_handleJoinLobby: targetConnection ID is not the same as messageFrom', {
                targetConnectionId: targetConnection.peer,
                messageFrom,
            });
        }

        this._handlePeerJsMessage(message, connection);
    }

    /**
     * message handlers
     * 1. Fail condition -> set finished
     * 2. Stall condition -> Retry
     * 3. Success -> set finished
     * 4. Retry for N times -> set finished
     */
    _handleConnectToUser = (message, connection) => {
        const { from: messageFrom, payload } = message;
        const { myId, displayName: myDisplayName } = this.state;
        const { displayName } = payload;

        this._connectionLookup[messageFrom] = connection;

        this.setState((state) => ({
            memberLookup: {
                ...state.memberLookup,
                [messageFrom]: new Member(messageFrom, displayName, false, null),
            },
        }));

        // create new member and add it
        this._connectionLookup[messageFrom].send(createAckConnectToUserMessage(myId, { displayName: myDisplayName }));
        this._setMessageFinished(message);
    }

    _handleAckConnectToUser = (message, connection) => {
        const { from: messageFrom, payload } = message;
        const { displayName } = payload;

        this._connectionLookup[messageFrom] = connection;

        this.setState((state) => ({
            memberLookup: {
                ...state.memberLookup,
                [messageFrom]: new Member(messageFrom, displayName, false, null),
            },
        }));
        this._setMessageFinished(message);
    }

    _handleRequestConnectionInfo = (message) => {
        // Drop the message if not host
        const { from: messageFrom } = message;
        const { isHosting, myId, lobbyId, lobbyMemberIds, teamLookup, memberLookup } = this.state;
        const targetConnection = this._connectionLookup[messageFrom];

        if (!isHosting) {
            console.error('_handleRequestConnectionInfo: Not a host', {
                lobbyId,
                myId,
                messageFrom,
            });
            this._setMessageFinished(message);

            return;
        }

        if (targetConnection) {
            const messageToSend = createResponseConnectionInfoMessage(myId, {
                teamLookup,
                memberLookup,
                lobbyMemberIds,
            });

            this._connectionLookup[messageFrom].send(messageToSend);
            this._setMessageFinished(message);
        } else {
            this._retryMessage(message);
        }
    }

    _handleResponseConnectionInfo = (message) => {
        // Verify if the message is from host
        const { from: messageFrom, payload } = message;
        const { lobbyMemberIds, teamLookup, memberLookup } = payload;
        const { lobbyId, isHosting } = this.state;

        if (isHosting || messageFrom !== lobbyId) {
            console.error('_handleResponseConnectionInfo: Spoofed as host', {
                lobbyId,
                messageFrom,
            });

            this._setMessageFinished(message);

            return;
        }

        this.setState({
            teamLookup,
            memberLookup,
            lobbyMemberIds,
        });

        this._setMessageFinished(message);
    }

    _handleJoinLobby = (message) => {
        const { from: messageFrom } = message;
        const { memberLookup, teamLookup } = this.state;

        const targetConnection = this._connectionLookup[messageFrom];

        if (targetConnection) {
            const { myId, lobbyMemberIds } = this.state;
            const messageToSend = createAckJoinLobbyMessage(myId, {
                memberLookup,
                teamLookup,
                lobbyMemberIds: [...lobbyMemberIds, messageFrom],
            });

            this.setState((state) => ({
                lobbyMemberIds: [...state.lobbyMemberIds, messageFrom],
            }));

            this._connectionLookup[messageFrom].send(messageToSend);
            this._setMessageFinished(message);
        } else {
            this._retryMessage(message);
        }
    }

    _handleAckJoinLobby = (message) => {
        const { from: messageFrom, payload } = message;

        const targetConnection = this._connectionLookup[messageFrom];

        if (targetConnection) {
            const { myId, lobbyId } = this.state;
            const { teamLookup, lobbyMemberIds, memberLookup } = payload;

            this.setState({
                memberLookup,
                teamLookup,
                lobbyMemberIds,
            });

            const sendRequestConnectionInfoMessage = () => {
                const messageToSend = createRequestConnectionInfoMessage(myId);

                this._connectionLookup[lobbyId].send(messageToSend);
            };

            // Should works without this
            this._fetchConnectionInfoTimer = setInterval(sendRequestConnectionInfoMessage, FETCH_CONNECTION_INFO_INTERVAL);
            this._setMessageFinished(message);
        } else {
            this._retryMessage(message);
        }
    }

    _handleToggleReady = (message) => {
        const { from: messageFrom } = message;
        const { isHosting, memberLookup } = this.state;

        const targetConnection = this._connectionLookup[messageFrom];
        const targetMember = memberLookup[messageFrom];

        if (!isHosting) {
            console.error('_handleToggleReady: Not a host');
            this._setMessageFinished(message);

            return;
        }

        if (targetConnection && targetMember) {
            this.setState((state) => ({
                memberLookup: R.evolve({
                    [messageFrom]: Member.toggleReady,
                }, state.memberLookup),
            }), () => {
                this._broadcastConnectionInfo();
            });

            this._setMessageFinished(message);
        } else {
            this._retryMessage(message);
        }
    }

    _handleChooseTeam = (message) => {
        const { from: messageFrom, payload } = message;
        const { targetTeamId } = payload;

        const { memberLookup, myId, isHosting } = this.state;
        const targetConnection = this._connectionLookup[messageFrom];
        const targetMember = memberLookup[messageFrom];

        if (!isHosting) {
            console.error('_handleChooseTeam: Not a host');

            this._setMessageFinished(message);

            return;
        }

        if (targetConnection && targetMember) {
            this._updateTeamId(targetTeamId, messageFrom);

            // Send Message
            const messageToSend = createAckChooseTeamMessage(myId, {
                targetTeamId,
            });

            targetConnection.send(messageToSend);

            this._setMessageFinished(message);
        } else {
            this._retryMessage(message);
        }
    }

    _handleAckChooseTeam = (message) => {
        const { from: messageFrom, payload } = message;
        const { targetTeamId } = payload;
        const { myId, lobbyId, isHosting } = this.state;

        if (isHosting || messageFrom !== lobbyId) {
            console.error('_handleAckChooseTeam: Spoofed as host', { messageFrom, lobbyId });

            this._setMessageFinished(message);

            return;
        }

        this._updateTeamId(targetTeamId, myId);

        this._setMessageFinished(message);
    }

    _handlePing = (message) => {
        const { from: messageFrom } = message;
        const targetConnection = this._connectionLookup[messageFrom];
        const { myId } = this.state;

        console.log('receive ping', { messageFrom });

        if (targetConnection) {
            targetConnection.send(createPongMessage(myId));
        } else {
            this._retryMessage(message);
        }

        this._setMessageFinished(message);
    }
    _handlePong = (message) => {
        const { from: messageFrom } = message;

        console.log('receive pong', { messageFrom });

        this._setMessageFinished(message);
    }

    /**
     * User actions
     *  */
    _connectToLobby = async (lobbyId, myId, displayName) => {
        const connection = this._peerJsClient.connect(lobbyId, { reliable: true });

        try {
            await this._handlePeerJsClientConnection(connection);

            connection.send(createConnectToUserMessage(myId, { displayName }));
            connection.send(createJoinLobbyMessage(myId));

            return Promise.resolve();
        } catch (err) {
            this._handlePeerJsDataConnectionError(err);

            return Promise.reject(err);
        }
    }

    _handleTeamSelect = (event, teamId, memberId) => {
        const { myId, lobbyId, isHosting, memberLookup, teamLookup } = this.state;

        if (isHosting) {
            console.log('teamId', teamId)
            console.log('memberId', memberId)
            console.log('memberLookup', memberLookup)

            this._updateTeamId(teamId, memberId).then(() => {
                this._broadcastConnectionInfo();
            });

            console.log('memberLookup', memberLookup)
            console.log('teamLookup', teamLookup)

        } else {
            const messageToSend = createChooseTeamMessage(myId, { targetTeamId: teamId });
            const hostConnection = this._connectionLookup[lobbyId];

            hostConnection.send(messageToSend);
        }
    }

    _handleReadyButtonClick = (event) => {
        // Don't update local state for ack to verify
        const { myId, lobbyId, isHosting } = this.state;

        if (isHosting) {
            this.setState((state) => ({
                memberLookup: R.evolve({
                    [myId]: Member.toggleReady,
                }, state.memberLookup),
            }), () => {
                this._broadcastConnectionInfo();
            });
        } else {
            const messageToSend = createToggleReadyMessage(myId);

            this._connectionLookup[lobbyId].send(messageToSend);
        }
    }

    _handlePeerJsClientConnection = async (connection) => {
        await initConnection(connection, {
            onOpen: (connection) => {
                this._handlePeerJsDataConnectionOpen(connection);
            },
            onError: (err, connection) => {
                this._handlePeerJsDataConnectionError(err, connection);
            },
            onClose: (connection) => {
                this._handlePeerJsDataConnectionClose(connection);
            },
            onData: async (data, connection) => {
                await this._handlePeerJsDataConnectionData(data, connection);
            },
        });
    }

    _createPeerJsClient = async (myId, peerJsConfig, { isHosting }) => {
        return await initPeerJsClient(myId, peerJsConfig, {
            onOpen: (id, peerJsClient) => {
                this._handlePeerJsClientOpen(myId, isHosting);
            },
            onError: (err, peerJsClient) => {
                this._handlePeerJsClientError(err);
            },
            onClose: (peerJsClient) => {
                this._handlePeerJsClientClose();
            },
            onConnection: async (connection, peerJsClient) => {
                try {
                    await this._handlePeerJsClientConnection(connection);
                } catch (err) {
                    this._handlePeerJsDataConnectionError(err);
                }
            },
        });
    }

    // Create lobby
    // TODO: handle the case that lobby created with the same lobbyId
    _handlePeerJsRegisterHost = async (event, lobbyId, displayName) => {
        const myId = lobbyId;
        const myMember = new Member(myId, displayName, false, null);
        const { peerJsConfig } = this.state;

        try {
            this._peerJsClient = await this._createPeerJsClient(myId, peerJsConfig, { isHosting: true, lobbyMemberIds: [ myId ] });

            this.setState((state) => ({
                lobbyId,
                myId: lobbyId,
                displayName,
                isHosting: true,
                lobbyMemberIds: [ myId ], // flush lobby member when hosting
                memberLookup: {
                    ...state.memberLookup,
                    [myId]: myMember,
                },
            }));
        } catch (err) {
            this._handlePeerJsClientError(err);
        }
    }

    // Join lobby
    // TODO: handle the case that joined non-existing lobbyId
    _handlePeerJsRegisterJoin = async (event, lobbyId, displayName) => {
        const myId = `m-${memberNanoid()}-id`;
        const myMember = new Member(myId, displayName, false, null);
        const { peerJsConfig } = this.state;

        try {
            this._peerJsClient = await this._createPeerJsClient(myId, peerJsConfig, { isHosting: false });
            await this._connectToLobby(lobbyId, myId, displayName);

            // wait until the host ack and update member
            this.setState((state) => ({
                lobbyId,
                myId,
                displayName,
                isHosting: false,
                lobbyMemberIds: [ myId ], // flush lobby member when joining
                memberLookup: {
                    ...state.memberLookup,
                    [myId]: myMember,
                },
            }));
        } catch (err) {
            return this._handlePeerJsClientError(err);
        }

    }

    _handleConfigUpdate = (event, host, port, path, debug) => {
        event.preventDefault();

        this.setState({
            peerJsConfig: {
                host,
                port,
                path,
                debug,
            },
        });
    }

    render() {
        const { showReduxConnectionInfo } = this.props;

        const {
            peerJsConfig,
            myId,
            lobbyMemberIds,
            errorMessage,
            memberLookup,
            teamLookup,

            lobbyId,
        } = this.state;

        const isUserRegistered = Boolean(myId);

        return (
            <div className={styles.rootContainer}>
                <p>Peerjs in use</p>
                <p>config: { JSON.stringify(peerJsConfig) }</p><br />
                <p>lobbyId: { lobbyId }</p>
                {
                    lobbyMemberIds.map((id) => (
                        <p key={`lobbyMember-${id}`}>{id}: { JSON.stringify(memberLookup[id]) }</p>
                    ))
                }
                {
                    R.keys(teamLookup).map((id) => (
                        <p key={`teamId-${id}`}>{id}: { JSON.stringify(teamLookup[id]) }</p>
                    ))
                }
                { errorMessage ? (
                    <p className={styles.errorMessage}>
                        { errorMessage }
                    </p>
                ) : null}
                <br />
                { isUserRegistered ? null : (
                    <PeerJsConfigForm
                        onSubmit={this._handleConfigUpdate}
                    />
                )}
                { isUserRegistered ? null : (
                    <PeerJsUserRegisterForm
                        onRegisterHost={this._handlePeerJsRegisterHost}
                        onRegisterJoin={this._handlePeerJsRegisterJoin}
                    />
                )}
                { isUserRegistered ? (
                    <Lobby
                        myId={myId}
                        maxMember={4}
                        teamLookup={teamLookup}
                        memberLookup={memberLookup}
                        lobbyMemberIds={lobbyMemberIds}
                        onReadyButtonClick={this._handleReadyButtonClick}
                        onTeamSelect={this._handleTeamSelect}
                    />
                ) : null}

                <button onClick={showReduxConnectionInfo}>debug1: show all redux connectionInfo</button>
                <button onClick={this.showAllConnection}>debug2: show all connection</button>
                <button onClick={this.sendPingMessageToAllConnection}>debug3: ping all connection</button>
            </div>
        );
    }
}

Peer.statics = {
    timeout: null,
};
