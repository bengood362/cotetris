import * as R from 'ramda';
import PropTypes from 'prop-types';
/**
 * @typedef {object} Member
 * @property {string} id             member id for peerjs connection
 * @property {string} displayName    display name
 * @property {bool} isReady          is ready to start game
 */

export default class Member {
    constructor(
        id,
        displayName,
        isReady,
        teamId = null,
    ) {
        this.id = id;
        this.displayName = displayName;
        this.isReady = isReady;
        this.teamId = teamId;
    }

    static PropType = PropTypes.shape({
        id: PropTypes.string.isRequired,
        displayName: PropTypes.string.isRequired,
        isReady: PropTypes.bool.isRequired,
        teamId: PropTypes.string,
    });

    static fromObj(memberObj) {
        return Object.assign(new Member(), memberObj);
    }

    static toggleReady = (member) => R.set(R.lensProp('isReady'), R.not(R.prop('isReady', member)))(member);
    static getId = (member) => R.pathOr(null, ['id'], member);
    static getTeamId = (member) => R.pathOr(null, ['teamId'], member);
    static setTeamId = R.curry((teamId, member) => R.set(R.lensProp('teamId'), teamId, member));
}
