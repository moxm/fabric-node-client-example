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

var log4js = require('log4js');
var logger = log4js.getLogger('QUERY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');

var config = require('./config.json');
var helper = require('./helper.js');

var client = new hfc();
var chain;

logger.setLevel(config.logLevel);

module.exports.query=function(_client,_chain,_eventhub,args){
    if(!!_chain){
	client = _client;
	chain = _chain;
    }else{
	init();
    }
    return query(args);
}

function init() {
    chain = client.newChain("fabric-client-query");
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    for (var i = 0; i < config.peers.length; i++) {
		chain.addPeer(new Peer(config.peers[i].peer_url));
    }
}

function query(args){
    return hfc.newDefaultKeyValueStore({
	    path: config.keyValueStore
    }).then(function(store) {
	    client.setStateStore(store);
	    return helper.getSubmitter(client);
    }).then(
	    function(admin) {
		    logger.info('Successfully obtained enrolled user to perform query');

		    logger.info('Executing Query');
		    var targets = [];
		    for (var i = 0; i < config.peers.length; i++) {
			    targets.push(config.peers[i]);
		    }
		    args = args||helper.getArgs(config.queryRequest.args);
		    //chaincode query request
		    var request = {
			    targets: targets,
			    chaincodeId: config.chaincodeID,
			    chainId: config.channelID,
			    txId: utils.buildTransactionID(),
			    nonce: utils.getNonce(),
			    fcn: config.queryRequest.functionName,
			    args: args
		    };
		    // Query chaincode
		    return chain.queryByChaincode(request);
	    }
    ).then(
	    function(response_payloads) {
		    for (let i = 0; i < response_payloads.length; i++) {
			    logger.info('Query results fore PEER%j: %j', i, response_payloads[i].toString('utf8'));
		    }
		    logger.info("Query finished");

		    var promise = new Promise((resolve,reject)=>{
			    resolve(response_payloads);
		    });
		    return promise;
	    }
    ).catch(
	    function(err) {
		    logger.error( err);
	    }
    );
}
