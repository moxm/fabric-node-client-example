/**
 * Created by Neel on 2017/2/14.
 */
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

var router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

logger.setLevel('DEBUG');


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


function init(chainName) {
    chain = client.newChain(chainName);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    eventhub = new EventHub();
    eventhub.setPeerAddr(config.events[0].event_url);
    eventhub.connect();
    for (let i = 0; i < config.peers.length; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
    }
}

function deploy(req, res) {
    // if (!process.env.GOPATH){
        process.env.GOPATH = config.goPath;
    // }

    hfc.newDefaultKeyValueStore({
        path: config.keyValueStore
    }).then(function(store) {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then(function(admin) {
        logger.info('Successfully obtained enrolled user to deploy the chaincode');

        logger.info('Executing Deploy');
        tx_id = helper.getTxId();
        let nonce = utils.getNonce();
        // var args = helper.getArgs(config.deployRequest.args);
        let args = req.body.args ? req.body.args : [];
        // send proposal to endorser
        let request = {
            chaincodePath: config.chaincodePath + req.body.chaincodeName,
            chaincodeId: req.params.name,
            fcn: config.deployRequest.functionName,
            args: args,
            chainId: req.params.channel,
            txId: tx_id,
            nonce: nonce,
        };
        return chain.sendDeploymentProposal(request);
    }).then(function(results) {
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
        return helper.processCommitter(tx_id, eventhub, 'deploy');
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


module.exports = router;