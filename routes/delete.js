

/**
 * Created by Neel on 2017/2/14.
 */
'use strict';

let express = require('express');
let bodyParser = require('body-parser');
let log4js = require('log4js');
let logger = log4js.getLogger('INVOKE');

let hfc = require('fabric-client');
let utils = require('fabric-client/lib/utils.js');
let Peer = require('fabric-client/lib/Peer.js');
let Orderer = require('fabric-client/lib/Orderer.js');
let EventHub = require('fabric-client/lib/EventHub.js');

let config = require('./config.json');
let helper = require('./helper.js');

let express = require('express');
let router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

logger.setLevel('DEBUG');


let client = new hfc();
let chain;
let eventhub;
let tx_id = null;

router.delete('/:key', function (req, res) {
    // res.send('Hello World!')
    console.log("delete > key: " + req.params.key);
    console.log(req.body);
    if (!chain) {
        init();
    }
    del(req, res);
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
function del(key, res) {
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

        let args = ["delete", key.params.key];
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
        return helper.processProposal(tx_id, eventhub, chain, results, 'delete');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            res.status = 200;
            res.send({code: 200, message: '删除成功'});
            logger.info('http response success');
        } else {
            res.status = 500;
            res.send({code: 500, message: '删除失败'});
            logger.info('http response error');
        }
        return helper.processCommitter(tx_id, eventhub, 'delete');
    }).then(function(response) {
        if (response.status === 'SUCCESS') {
            logger.info('The chaincode transaction has been successfully committed');
            // process.exit();
            eventhub.disconnect();
        } else {
            eventhub.disconnect();
        }
    }).catch(function(err) {
        res.status = 500;
        res.send({code: 500, message: '删除失败'});
        eventhub.disconnect();
        logger.error('Failed to invoke transaction due to error: ' + err.stack ? err.stack : err);
    });
}


module.exports = router;