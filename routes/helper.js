/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('Helper');

var path = require('path');
var util = require('util');

var User = require('fabric-client/lib/User.js');
var utils = require('fabric-client/lib/utils.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');

var config = require('./config.json');

logger.setLevel('DEBUG');

module.exports.getSubmitter = function(client) {
    let users = config.users;
    let username = users[0].username;
    let password = users[0].secret;
    let member;
    return client.getUserContext(username)
            .then((user) => {
            if (user && user.isEnrolled()) {
        logger.info('Successfully loaded member from persistence');
        return user;
    } else {
        let ca_client = new copService(config.caserver.ca_url);
        // need to enroll it with CA server
        return ca_client.enroll({
                enrollmentID: username,
                enrollmentSecret: password
            }).then((enrollment) => {
                logger.info('Successfully enrolled user \'' + username + '\'');

        member = new User(username, client);
        return member.setEnrollment(enrollment.key, enrollment.certificate);
    }).then(() => {
            return client.setUserContext(member);
    }).then(() => {
            return member;
    }).catch((err) => {
            logger.error('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
        throw new Error('Failed to obtain an enrolled user');
    });
    }
});
};
module.exports.processProposal = function(tx_id, eventhub, chain, results, proposalType) {
    let proposalResponses = results[0];
    //logger.debug('deploy proposalResponses:'+JSON.stringify(proposalResponses));
    let proposal = results[1];
    let header = results[2];
    let all_good = true;
    for (let i in proposalResponses) {
        let one_good = false;
        if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
            one_good = true;
            logger.info(proposalType + ' proposal was good');
        } else {
            logger.error(proposalType + ' proposal was bad');
        }
        all_good = all_good & one_good;
        //FIXME:  App is supposed to check below things:
        // validate endorser certs, verify endorsement signature, and compare the WriteSet among the responses
        // to make sure they are consistent across all endorsers.
        // SDK will be enhanced to make these checks easier to perform.
    }
    if (all_good) {
        if (proposalType == 'deploy') {
            logger.info(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
        } else {
            logger.info('Successfully obtained transaction endorsements.');
        }

        let request = {
            proposalResponses: proposalResponses,
            proposal: proposal,
            header: header
        };

        // set the transaction listener and set a timeout of 30sec
        // if the transaction did not get committed within the timeout period,
        // fail the test
        let sendPromise = chain.sendTransaction(request);
        return Promise.all([sendPromise]).then((results) => {
            return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
        }).catch((err) => {
            logger.error('Failed to send transaction and get notifications within the timeout period. ' + err.stack ? err.stack : err);
        });

    } else {
        logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
        throw new Error('Problems happened when examining proposal responses');
    }
};

module.exports.processCommitter = function(tx_id, eventhub, proposalType) {

    // set the transaction listener and set a timeout of 30sec
    // if the transaction did not get committed within the timeout period,
    // fail the test
    let deployId = tx_id.toString();
    let txPromise = new Promise((resolve, reject) => {
        let handle = setTimeout(reject, config.waitTime);

        eventhub.registerTxEvent(deployId, (tx) => {
            logger.info('The chaincode'+(proposalType == 'deploy' ? proposalType: '')+' transaction has been successfully committed');
            clearTimeout(handle);
            eventhub.unregisterTxEvent(deployId);
            resolve();
        });
    });

    // let sendPromise = chain.sendTransaction(request);
    return Promise.all([txPromise]).then((results) => {
        return results[0]; // the first returned value is from the 'txPromise' which is from the 'sendTransaction()' call
    }).catch((err) => {
        logger.error('Failed to send transaction and get notifications within the timeout period. ' + err.stack ? err.stack : err);
    });
}

module.exports.getArgs = function(chaincodeArgs) {
    let args = [];
    for (let i = 0; i < chaincodeArgs.length; i++) {
        args.push(chaincodeArgs[i]);
    }
    return args;
};

module.exports.getTxId = function() {
    return utils.buildTransactionID({
        length: 12
    });
};