

/**
 * Created by Neel on 2017/2/14.
 */
'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger('QUERY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');

var config = require('./config.json');
var helper = require('./helper.js');

var express = require('express');
var router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

logger.setLevel('DEBUG');


var client = new hfc();
var chain;

router.get('/:key', function (req, res) {
    // res.send('Hello World!')
    console.log("get > key: " + req.params.key);
    console.log(req.body);
    if (!chain) {
        init();
    }
    query(req, res);
})
/*
router.post('/map/', function (req, res) {
    // res.send('Hello World!')
    console.log("put");
    console.log(req.body.key);
    console.log(req.body.value);
    res.send(req.body);
})
router.delete('/map/:key', function (req, res) {
    console.log("delete > key: " + req.params.key);
    res.send("delete > key: " + req.params.key);
})
 */
function init() {
    chain = client.newChain(config.chainName);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    for (let i = 0; i < config.peers.length; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
    }
}


function query(key, res) {
    hfc.newDefaultKeyValueStore({
        path: config.keyValueStore
    }).then(function(store) {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then(function(admin) {
        logger.info('Successfully obtained enrolled user to perform query');

        logger.info('Executing Query');
        let targets = [];
        for (let i = 0; i < config.peers.length; i++) {
            targets.push(config.peers[i]);
        }
        let args = ["query", key.params.key];

        //chaincode query request
        let request = {
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
    }).then(function(response_payloads) {
        for (let i = 0; i < response_payloads.length; i++) {
            logger.info('############### Query results after the move on PEER%j, User "b" now has  %j', i, response_payloads[i].toString('utf8'));
        }

        if (response_payloads.length == 0) {
            res.status = 500;
            res.send({code: 500, message: '值不存在'});
        } else {
            res.status = 200;
            res.send({code: 200, message: '查询成功', body: response_payloads[0].toString('utf8')});
        }
    }).catch(function(err) {
        res.status = 500;
        res.send({code: 500, message: '查询异常'});
            logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
    });
}


module.exports = router;