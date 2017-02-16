

/**
 * Created by Neel on 2017/2/14.
 */
'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var log4js = require('log4js');
var logger = log4js.getLogger('INVOKE');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');

var config = require('./config.json');
var helper = require('./helper.js');

var express = require('express');
var router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

logger.setLevel('DEBUG');


var client = new hfc();
var chain;
var eventhub;
var tx_id = null;

router.post('/', function (req, res) {
    // res.send('Hello World!')
    console.log("put");
    console.log(req.body.key);
    console.log(req.body.value);
    if (!chain) {
        init();
    }
    put(req, res);
})

function init() {
    chain = client.newChain(config.chainName);
    chain.addOrderer(new Orderer(config.orderer.orderer_url));
    eventhub = new EventHub();
    eventhub.setPeerAddr(config.events[0].event_url);
    eventhub.connect();
    for (let i = 0; i < config.peers.length; i++) {
        chain.addPeer(new Peer(config.peers[i].peer_url));
    }
}
function put(req, res) {
    hfc.newDefaultKeyValueStore({
        path: config.keyValueStore
    }).then(function(store) {
        client.setStateStore(store);
        return helper.getSubmitter(client);
    }).then(function(admin) {
        logger.info('Successfully obtained user to submit transaction');

        logger.info('Executing Invoke');
        tx_id = helper.getTxId();
        let nonce = utils.getNonce();

        let args = ["put", req.body.key, req.body.value];
        // send proposal to endorser
        let request = {
            chaincodeId: config.chaincodeID,
            fcn: config.deleteRequest.functionName,
            args: args,
            chainId: config.channelID,
            txId: tx_id,
            nonce: nonce
        };
        return chain.sendTransactionProposal(request);
    }).then(function(results) {
        logger.info('Successfully obtained proposal responses from endorsers');
        return helper.processProposal(tx_id, eventhub, chain, results, 'put');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            res.status = 200;
            res.send({code: 200, message: '保存成功'});
            logger.info('http response success');
        } else {
            res.status = 500;
            res.send({code: 500, message: '保存失败'});
            logger.info('http response error');
        }
        return helper.processCommitter(tx_id, eventhub, 'put');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            logger.info('The chaincode transaction has been successfully committed');
            // process.exit();
            eventhub.disconnect();
        } else {
            res.status = 500;
            res.send({code: 500, message: '保存失败'});
            eventhub.disconnect();
        }
    }).catch(function(err) {
        res.status = 500;
        res.send({code: 500, message: '保存异常'});
        eventhub.disconnect();
        logger.error('Failed to invoke transaction due to error: ' + err.stack ? err.stack : err);
    });
}


module.exports = router;