registerPlugin({
	name: 'He\'s watching !',
	version: '0.0.1',
    backends: ['ts3'],
    engine: '>= 0.9.18',
	description: 'Move/Kick clients when idle',
	author: 'Filtik <filtik@gmx.net>',
	vars: [
		{
			name: 'debug',
			title: 'debug mode on / off',
			type: 'select',
			options: [
				'No',
				'Yes'
			]
		},
		{
			name: 'action',
			title: 'Select the action if a client is idle for more than the specified maximum time [default: move]',
			type: 'select',
			options: [
				'move',
				'kick'
			]
		},
		{
			name: 'moveback',
			title: 'If clients got moved, move client back if not idle anymore? [default: no]',
			type: 'select',
			conditions: [
				{ field: 'action', value: 0 }
			],
			indent: 2,
			options: [
				'No',
				'Yes'
			]
		},
		{
			name: 'idle_channel_id',
			title: 'If clients should be moved, set channel id to move idle clients into it.',
			type: 'channel'
		},
		{
			name: 'warn_time',
			title: 'Set the idle warn time in minutes or set -1 to disable this feature. The idle warn time has to be smaller than the max idle time (min difference to idle time is 10) [default: 0]',
			type: 'number'
		},
		{
			name: 'max_time',
			title: 'Set the max idle time in minutes. If clients should be kicked, the client will be kicked after being idle for this time. If clients should be moved, the client will be moved to specified channel after being idle for this time! [default: 10]',
			type: 'number'
		},
		{
			name: 'kick_time',
			title: 'Kick player that are in the afk channel for to long [default: 0]',
			type: 'number'
		},
		{
			name: 'warn_message',
			title: 'Idle warning message, the client get this message as chat message. ({IDLE_WARN_TIME} = Replaced with idle warn time, {IDLE_MAX_TIME} = Replaced with max idle time)',
			type: 'multiline'
		},
		{
			name: 'kick_message',
			title: 'Idle message, the client get this message as kick reason or chat message. ({IDLE_MAX_TIME} = Replaced with max idle time) ({IDLE_CHANNEL_NAME} = If clients should be moved, this will be replaced with the channel name of target idle channel) ({IDLE_CHANNEL_NAME} - If clients should be moved, this will be replaced with the channel name of target idle channel)',
			type: 'multiline'
		},
		{
			name: 'ignored_clients',
			title: 'Clients that should be ignored. Use client databaseID seperated by semicolon. Ex : 12;23;34;56',
			type: 'string'
		},
		{
			name: 'ignored_channels',
			title: 'Channels that should be ignored. Use channel ID seperated by semicolon. Ex: 1;2;3;4',
			type: 'string'
		},
		{
			name: 'ignored_sub_channels',
			title: 'Subchannels that should be ignored. Use subchannel ID seperated by semicolon. Ex: 1;2;3;4',
			type: 'string'
		},
		{
			name: 'ignored_server_group',
			title: 'Server group that should be ignored. Use server group ID seperated by semicolon. Ex: 1;2;3;4',
			type: 'string'
		}
	]
}, function(sinusbot, config) {
	var engine = require('engine');
	var backend = require('backend');
	var event = require('event');
	var client = require('client');

	var isConnected = backend.isConnected();

	if (!isConnected) {
		engline.log('Bot must be connected before loading the script !');
		return;
	}

	config.ignored_clients = typeof config.ignored_clients === 'undefined' ? '' : config.ignored_clients;
	config.ignored_channels = typeof config.ignored_channels === 'undefined' ? '' : config.ignored_channels;
	config.ignored_sub_channels = typeof config.ignored_sub_channels === 'undefined' ? '' : config.ignored_sub_channels;
	config.ignored_server_group = typeof config.ignored_server_group === 'undefined' ? '' : config.ignored_server_group;
	config.action = typeof config.action === 'undefined' || config.action  === '' ? 0 : config.action;
	config.debug = typeof config.debug === 'undefined' || config.debug  === '' ? 0 : config.debug;
	config.idle_channel_id = typeof config.idle_channel_id === 'undefined' || config.idle_channel_id  === '' ? null : config.idle_channel_id;
	config.max_time = typeof config.max_time === 'undefined' || config.max_time  === '' ? 10 : config.max_time;
	config.warn_time = typeof config.warn_time === 'undefined' || config.warn_time  === '' ? 0 : config.warn_time;
	config.kick_time = typeof config.kick_time === 'undefined' || config.kick_time  === '' ? 0 : config.kick_time;
	config.moveback = typeof config.moveback === 'undefined' || config.moveback  === '' ? 0 : config.moveback;
		
	if (config.idle_channel_id === null) {
		engine.log('Idle channel not defined - break');
		return;
	}

	if (config.max_time < 10) {
		config.max_time = 10;
		engine.log('idleTime is to low, set to default 10');
	}

	if ((config.max_time - config.warn_time) < 10) {
		config.max_time = (config.warn_time + 10);
		engine.log('the difference from idle time and warn time is to low, set the idle time to ' + config.max_time);
	}

	if (config.kick_time > 0 && config.kick_time < 10) {
		config.kick_time = 10;
		engile.log('Kick_time to low, set to 10');
	}
	
	if (typeof config.warn_message === 'undefined' || config.warn_message === '') {
		config.warn_message = 'You are already since {IDLE_WARN_TIME} minutes idle. If you are {IDLE_MAX_TIME} minutes idle, you will be moved to channel {IDLE_CHANNEL_NAME}!';
	}

	if (typeof config.kick_message === 'undefined' || config.kick_message === '') {
		config.kick_message = 'You are now idle for more than {IDLE_MAX_TIME} minutes, you got moved to the channel {IDLE_CHANNEL_NAME}!';
	}

	var IDLE_KICK = config.action == 1;
	var DEBUG = config.debug == 1;
	var IGNORED_CHANNEL_LIST = {};
	var IGNORED_GROUP_LIST = {};
	var KICK_MESSAGE = config.kick_message;
	var IDLE_MAX_TIME = parseInt(config.max_time); // * 1000 * 60;
	var IDLE_WARN_MESSAGE = config.warn_message;
	var IDLE_WARN_TIME = parseInt(config.warn_time); // * 1000 * 60;
	var MOVED_TO_AFK = {};
	var KICK_TIME = parseInt(config.kick_time);
	var IDLE_CLIENTS_WARN_SENT = {};
	var IDLE_MOVE_BACK = config.moveback == 1;
	var IDLE_CLIENTS_MOVED = {};
	var IGNORED_CLIENT_LIST = {};
	var idleMessage = null;
	var idleWarnMessage = null;
	var idleChannel = backend.getChannelByID(idle_channel_id);

	if (!idleChannel) {
		engine.log('Invalid channel ID !');
		return;
	}

	function debug(msg) {
		if (DEBUG) {
			engine.log('[debug]' + msg);
		}
	};

	function getChildren(currentChannel) {
		backend.getChannels().forEach(function(channel) {
			var parent = channel.parent();
			if (parent && currentChannel.id() === parent.id()) {
				IGNORED_CHANNEL_LIST[channel.id()] = true;
				debug('ADDING CHANNEL TO IGNORED LIST => ' + channel.id());
				getChildren(channel);
			}
		});
	};

	function createMessage() {
		idleMessage = KICK_MESSAGE;
		idleMessage = idleMessage.replace("{IDLE_MAX_TIME}", IDLE_MAX_TIME);
		if (!IDLE_KICK) {
			idleMessage = idleMessage.replace("{IDLE_CHANNEL_NAME}", idleChannel.name());
		}
		
		if (IDLE_WARN_TIME > 0)
		{
			idleWarnMessage = String(IDLE_WARN_MESSAGE);
			idleWarnMessage = idleWarnMessage.replace("{IDLE_WARN_TIME}", IDLE_WARN_TIME);
			idleWarnMessage = idleWarnMessage.replace("{IDLE_MAX_TIME}", IDLE_MAX_TIME);
			if (!IDLE_KICK) {
				idleWarnMessage = idleWarnMessage.replace("{IDLE_CHANNEL_NAME}", idleChannel.name());
			}
		}
	};

	var arr = config.ignored_clients.split(';');
	for(var i = 0; i < arr.length; i++) {
		var dbID = arr[i].trim();
		if (dbID !== '') {
			IGNORED_CLIENT_LIST[dbID] = true;
			debug('ADDING CLIENT TO IGNORED LIST => ' + dbID);
		}
	};

	arr = config.ignored_channels.split(';');
	for(var i = 0; i < arr.length; i++) {
		var dbID = arr[i].trim();
		if (dbID !== '') {
			IGNORED_CHANNEL_LIST[dbID] = true;
			debug('ADDING CHANNEL TO IGNORED LIST => ' + dbID);
		}
	};

	arr = config.ignored_sub_channels.split(';');
	for(var i = 0; i < arr.length; i++) {
		var dbID = arr[i].trim();
		if (dbID !== '') {
			IGNORED_CHANNEL_LIST[dbID] = true;
			debug('ADDING CHANNEL TO IGNORED LIST => ' + dbID);
			getChildren(backend.getChannelByID(dbID));
		}
	};

	arr = config.ignored_server_group.split(';');
	for(var i = 0; i < arr.length; i++) {
		var dbID = arr[i].trim();
		if (dbID !== '') {
			IGNORED_CLIENT_LIST[dbID] = true;
			debug('ADDING SERVER GROUP TO IGNORED LIST => ' + dbID);
		}
	};

	debug('IDLE_MAX_TIME => ' + IDLE_MAX_TIME);
	debug('IDLE_WARN_TIME => ' + IDLE_WARN_TIME);
	debug('IDLE_MOVE_BACK => ' + IDLE_MOVE_BACK);
	debug('IDLE_KICK => ' + IDLE_KICK);
	debug('KICK_MESSAGE => ' + KICK_MESSAGE);
	debug('IDLE_WARN_MESSAGE => ' + IDLE_WARN_MESSAGE);
	debug('KICK_TIME => ' + KICK_TIME);

	createMessage();
	
	function handleClientCheck() {
		var wasMoved;
		var clients = backend.getClients();
		clients.forEach(function(client) {
			var clientServerGroups = [],
			clientID = client.databaseID(),
			clientName = client.name(),
			clientGroups = client.getServerGroups(),
			clientChan = client.getChannels()[0].id(),
			wasMoved = false;

			debug('Checking client : ' + clientName + '(' + clientID + ')');
			
			clientGroups.forEach(function(sg) {
				clientServerGroups.push(sg.id());
			});

			debug('clientServerGroups => ' + clientServerGroups);
			
			if (client.isSelf()) {
				debug('client is bot');
				return; // skip bot
			}
			
			if (IDLE_MOVE_BACK && IDLE_CLIENTS_MOVED[clientID]) {
				wasMoved = true;
			}
			
			idleTime = Math.floor(client.getIdleTime() / (1000 * 60));
			debug('idle time => ' + idleTime + ' minutes');

			if (IGNORED_CLIENT_LIST[clientID]) {
				debug('client is ignored');
				return; // skip ignored client
			}

			if (KICK_TIME > 0) {
				var since = MOVED_TO_AFK[clientID];
				var maxAllowed = Date.now() - (KICK_TIME * 60 * 1000);
				if (since && since > maxAllowed) {
					debug('Client in afk for to long');
					client.kick('You were afk for too long !');
					delete IDLE_CLIENTS_MOVED[clientID];
					delete IDLE_CLIENTS_WARN_SENT[clientID];
					delete MOVED_TO_AFK[clientID];
					return;
				}
			}

			if (idleTime > IDLE_MAX_TIME) {

				if (clientChan === idleChannel.id()) {
					debug('client is already in AFK channel');
					return; // skip client already in the AFK channel
				}

				var skip = isIDListed(clientChan, IGNORED_CHANNEL_LIST) || isIDListed(clientServerGroups, IGNORED_GROUP_LIST);

				debug('skipping client base on channel and groups : ' + skip);
				
				if (IDLE_KICK && !skip) {
					delete IDLE_CLIENTS_WARN_SENT[clientID]
					debug('kicking client');
					client.kick(idleMessage);
				} else if (!skip) {
						debug('moving client');
						client.moveTo(idleChannel.id());
						delete IDLE_CLIENTS_WARN_SENT[clientID];
						if (IDLE_MOVE_BACK) {

							IDLE_CLIENTS_MOVED[clientID] = {channel: clientChan};
						}
						client.chat(idleMessage);
				}
			} else if (IDLE_WARN_TIME > 0 && idleTime >= IDLE_WARN_TIME) {
				if (!IDLE_CLIENTS_WARN_SENT[clientID]) {
					var skip = isIDListed(clientChan, IGNORED_CHANNEL_LIST) || isIDListed(clientServerGroups, IGNORED_GROUP_LIST);
					if (clientChan !== idleChannel.id() && !skip) {
						client.chat(idleWarnMessage);
						IDLE_CLIENTS_WARN_SENT[clientID] = true;
					}
				}
			} else if (IDLE_WARN_TIME > 0 && idleTime < IDLE_WARN_TIME) {
				delete IDLE_CLIENTS_WARN_SENT[clientID];
			}
			
			if (wasMoved && idleTime < IDLE_MAX_TIME) {// && !client.isAway() && !client.isMuted() && !client.isDeaf()) {
				if (clientChan === idleChannel.id()) {
					client.moveTo(IDLE_CLIENTS_MOVED[clientID].channel);
				}
				delete IDLE_CLIENTS_MOVED[clientID];
				delete IDLE_CLIENTS_WARN_SENT[clientID];
			}
		});
	};
	
	function isIDListed(_id, list) {
		var isINList = false;

		if(Object.prototype.toString.call(_id) === "[object Array]") {
			for(var i = 0; i < _id.length && !isINList; i++) {
				var id = _id[i];
				isINList = !!list[id];
			}
		} else {
			isINList = !!list[_id];
		}
		return isINList;
	};

	sinusbot.on('clientMove', function (moveInfo) {
		var clientID = moveInfo.client.databaseID();

		if (!moveInfo.toChannel) {
			// disconnected
			delete IDLE_CLIENTS_MOVED[clientID];
			delete IDLE_CLIENTS_WARN_SENT[clientID];
		} else if (moveInfo.toChannel.id() === idleChannel.id()) {
			// client moved to afk channel
			if (KICK_TIME > 0) {
				MOVED_TO_AFK[clientID] = Date.now();
			}
		}
	});

	sinusbot.on('clientKicked', function (moveInfo) {
		var clientID = moveInfo.client.databaseID();

		delete IDLE_CLIENTS_MOVED[clientID];
		delete IDLE_CLIENTS_WARN_SENT[clientID];
		delete MOVED_TO_AFK[clientID];
	});
	
	setInterval(function() {
		try {
			debug('Client check in progress ...')
			handleClientCheck();
			debug('Client check done .')
		} catch (error) {
			engine.log(error);
		}
	}, 30000);
});
