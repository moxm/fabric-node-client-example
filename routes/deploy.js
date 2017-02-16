/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
// This is Sample end-to-end standalone program that focuses on exercising all
// parts of the fabric APIs in a happy-path scenario
'use strict';


var express = require('express');
var bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var config = require('./config.json');
var helper = require('./helper.js');


var express = require('express');
var router = express.Router();


var client = new hfc();
var chain;
var eventhub;
var tx_id = null;

router.put('/:channel/:name/deploy', function (req, res) {
    // res.send('Hello World!')
    console.log("deploy > channel: " + req.params.channel);
    console.log("deploy > name: " + req.params.name);
    console.log(req.body);
    if (!chain) {
        init(req.params.name);
    }
    deploy(req, res);
})

logger.setLevel('DEBUG');



function init(chainName) {
    chain = client.newChain(chainName);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    eventhub = new EventHub();
    eventhub.setPeerAddr(config.events[0].event_url);
    eventhub.connect();
    for (var i = 0; i < config.peers.length; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
    }
}

function deploy(req, res) {
    if (!process.env.GOPATH){
        process.env.GOPATH = config.goPath;
    }

    hfc.newDefaultKeyValueStore({
        path: config.keyValueStore
    }).then(function(store) {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then(
        function(admin) {
            logger.info('Successfully obtained enrolled user to deploy the chaincode');

            logger.info('Executing Deploy');
            tx_id = helper.getTxId();
            var nonce = utils.getNonce();
            // var args = helper.getArgs(config.deployRequest.args);
            var args = req.body.args ? req.body.args : [];
            // send proposal to endorser
            var request = {
                chaincodePath: config.chaincodePath + req.body.chaincodeName,
                chaincodeId: req.params.name,
                fcn: config.deployRequest.functionName,
                args: args,
                chainId: req.params.channel,
                txId: tx_id,
                nonce: nonce,
            };
            return chain.sendDeploymentProposal(request);
        }
    ).then(function(results) {
        logger.info('Successfully obtained proposal responses from endorsers');
        return helper.processProposal(tx_id, eventhub, chain, results, 'deploy');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            res.status = 200;
            res.send({code: 200, message: '部署成功'});
            logger.info('http response success');
        } else {
            res.status = 500;
            res.send({code: 500, message: '部署失败'});
            logger.info('http response error');
        }
        return helper.processCommitter(tx_id, eventhub, 'delete');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            logger.info('Successfully sent deployment transaction to the orderer.');
            // process.exit();
            eventhub.disconnect();
        } else {
            logger.error('Failed to order the deployment endorsement. Error code: ' + response.status);
            eventhub.disconnect();
        }
    }).catch(
        function(err) {
            eventhub.disconnect();
            logger.error(err.stack ? err.stack : err);
        }
    );
}

