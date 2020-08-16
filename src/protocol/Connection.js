// TODO: Connection Protocol doesn't support message hopping :)
// TODO: Verification of message? chain of trust
// TODO: Message Session for paired messages?
// TODO: add a timestamp & pqueue there later?
import { nanoid } from 'nanoid';

const PROTOCOL = 'CONNECTION';
/**
 * Character: Host, Player
 * v2
 * 1. Host a lobby with id
 * 2. Join lobby by id
 * 3. Create peer connection to everyone
 * 4. Choose team/ be assign team and ready
 */

const MessageTypes = {
    // Connection -- inter-player
    CONNECT_TO_USER: 'CONNECT_TO_USER',
    ACK_CONNECT_TO_USER: 'ACK_CONNECT_TO_USER',

    SYNC_USER_LOOKUP: 'SYNC_USER_LOOKUP',
    ACK_SYNC_USER_LOOKUP: 'ACK_SYNC_USER_LOOKUP',

    // Lobby Management
    REQUEST_CONNECTION_INFO: 'REQUEST_CONNECTION_INFO', // Player -> Host
    RESPONSE_CONNECTION_INFO: 'RESPONSE_CONNECTION_INFO', // Host -> Player

    JOIN_LOBBY: 'JOIN_LOBBY',
    ACK_JOIN_LOBBY: 'ACK_JOIN_LOBBY',

    // Team management
    SYNC_TEAM_LOOKUP: 'SYNC_TEAM_LOOKUP', // Host -> Player
    ACK_SYNC_TEAM_LOOKUP: 'ACK_SYNC_TEAM_LOOKUP',

    ASSIGN_TEAM: 'ASSIGN_TEAM', // Host -> Player
    ACK_ASSIGN_TEAM: 'ACK_ASSIGN_TEAM',

    CHOOSE_TEAM: 'CHOOSE_TEAM',
    ACK_CHOOSE_TEAM: 'ACK_CHOOSE_TEAM',

    // Game
    TOGGLE_READY: 'TOGGLE_READY',
    // Toggle ready -> broadcast RESPONSE_CONNECTION_INFO
    INIT_GAME: 'INIT_GAME',
    ACK_INIT_GAME: 'ACK_INIT_GAME',

    // Utils
    PING: 'PING',
    PONG: 'PONG',
};

function createCommonProperties() {
    return {
        protocol: PROTOCOL,
        uniqueId: nanoid(),
        timestamp: Date.now(),
    };
}

// Team messages
function createConnectToUserMessage(myId, params) {
    const { displayName } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.CONNECT_TO_USER,
        from: myId,
        payload: {
            displayName,
        },
    });
}

function createAckConnectToUserMessage(myId, params) {
    const { displayName } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_CONNECT_TO_USER,
        from: myId,
        payload: {
            displayName,
        },
    });
}

function createRequestConnectionInfoMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.REQUEST_CONNECTION_INFO,
        from: myId,
        payload: {},
    });
}

function createSyncUserLookupMessage(myId, params) {
    const { userLookup } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.SYNC_USER_LOOKUP,
        from: myId,
        payload: {
            userLookup,
        },
    });
}

function createAckSyncUserLookupMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_SYNC_USER_LOOKUP,
        from: myId,
        payload: {},
    });
}

function createResponseConnectionInfoMessage(myId, params) {
    const { lobbyMemberIds, teamLookup, memberLookup } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.RESPONSE_CONNECTION_INFO,
        from: myId,
        payload: {
            teamLookup,
            memberLookup,
            lobbyMemberIds,
        },
    });
}

function createJoinLobbyMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.JOIN_LOBBY,
        from: myId,
        payload: {},
    });
}

function createAckJoinLobbyMessage(myId, params) {
    const { teamLookup, memberLookup, lobbyMemberIds } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_JOIN_LOBBY,
        from: myId,
        payload: {
            teamLookup,
            memberLookup,
            lobbyMemberIds,
        },
    });
}

function createSyncTeamLookupMessage(myId, params) {
    const { teamLookup } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.SYNC_TEAM_LOOKUP,
        from: myId,
        payload: {
            teamLookup,
        },
    });
}

function createAckSyncTeamLookupMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_SYNC_TEAM_LOOKUP,
        from: myId,
        payload: {},
    });
}

function createAssignTeamMessage(myId, params) {
    const { targetUserId } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ASSIGN_TEAM,
        from: myId,
        payload: {
            targetUserId,
        },
    });
}

function createAckAssignTeamMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_ASSIGN_TEAM,
        from: myId,
        payload: {},
    });
}

function createChooseTeamMessage(myId, params) {
    const { targetTeamId } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.CHOOSE_TEAM,
        from: myId,
        payload: {
            targetTeamId,
        },
    });
}

function createAckChooseTeamMessage(myId, params) {
    const { targetTeamId } = params;

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_CHOOSE_TEAM,
        from: myId,
        payload: {
            targetTeamId,
        },
    });
}

function createToggleReadyMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.TOGGLE_READY,
        from: myId,
        payload: {},
    });
}

function createInitGameMessage(myId, params) {
    const { teamIds } = params; // [Team1, Team2]

    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.INIT_GAME,
        from: myId,
        payload: {
            teamIds,
        },
    });
}

function createAckInitGameMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.ACK_INIT_GAME,
        from: myId,
        payload: {},
    });
}

function createPingMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.PING,
        from: myId,
        payload: {},
    });
}

function createPongMessage(myId) {
    return JSON.stringify({
        ...createCommonProperties(),
        type: MessageTypes.PONG,
        from: myId,
        payload: {},
    });
}

export {
    PROTOCOL,
    MessageTypes,

    createConnectToUserMessage,
    createAckConnectToUserMessage,
    createSyncUserLookupMessage,
    createAckSyncUserLookupMessage,

    createRequestConnectionInfoMessage,
    createResponseConnectionInfoMessage,
    createJoinLobbyMessage,
    createAckJoinLobbyMessage,

    createSyncTeamLookupMessage,
    createAckSyncTeamLookupMessage,
    createAssignTeamMessage,
    createAckAssignTeamMessage,
    createChooseTeamMessage,
    createAckChooseTeamMessage,

    createToggleReadyMessage,
    createInitGameMessage,
    createAckInitGameMessage,

    createPingMessage,
    createPongMessage,
};
