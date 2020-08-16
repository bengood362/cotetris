import PropTypes from 'prop-types';
import * as R from 'ramda';
/**
 * @typedef {object} Team
 * @property {string} id                only team1 and 2 for now
 * @property {string} teamColor         for lobby rendering
 * @property {Array<string>} memberIds  contains who is in the team
 */

export default class Team {
    constructor(
        id,
        teamColor,
        memberIds = [],
    ) {
        this.id = id;
        this.teamColor = teamColor;
        this.memberIds = memberIds;
    }

    static PropType = PropTypes.shape({
        id: PropTypes.string.isRequired,
        memberIds: PropTypes.arrayOf(PropTypes.string.isRequired).isRequired,
        teamColor: PropTypes.string.isRequired,
    });

    static fromObj(teamObj) {
        return Object.assign(new Team(), teamObj);
    }

    static setTeamMembers = R.curry(
        (memberIds, team) => {
            return R.set(R.lensProp('memberIds'), memberIds, team);
        }
    );

    static addTeamMembers = R.curry(
        (memberIds, team) => {
            const currentMemberIds = R.pathOr([], ['memberIds'], team);
            const setMemberIds = R.set(R.lensProp('memberIds'));

            return setMemberIds(R.uniq(R.concat(currentMemberIds, memberIds)), team);
        }
    );

    static removeTeamMembers = R.curry(
        (memberIds, team) => {
            const currentMemberIds = R.pathOr([], ['memberIds'], team);
            const setMemberIds = R.set(R.lensProp('memberIds'));
            const removeTargetMemberIds = R.reject((memberId) => R.any(R.equals(R.__, memberId), memberIds));

            return setMemberIds(removeTargetMemberIds(currentMemberIds), team);
        }
    );
}
