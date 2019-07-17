'use strict';
'require ui';
'require form';
'require network';
'require firewall';

var CBIZoneSelect = form.ListValue.extend({
	__name__: 'CBI.ZoneSelect',

	load: function(section_id) {
		return Promise.all([ firewall.getZones(), network.getNetworks() ]).then(L.bind(function(zn) {
			this.zones = zn[0];
			this.networks = zn[1];

			return this.super('load', section_id);
		}, this));
	},

	filter: function(section_id, value) {
		return true;
	},

	lookupZone: function(name) {
		return this.zones.filter(function(zone) { return zone.getName() == name })[0];
	},

	lookupNetwork: function(name) {
		return this.networks.filter(function(network) { return network.getName() == name })[0];
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		var values = L.toArray((cfgvalue != null) ? cfgvalue : this.default),
		    choices = {};

		if (this.allowlocal) {
			choices[''] = E('span', {
				'class': 'zonebadge',
				'style': 'background-color:' + firewall.getColorForName(null)
			}, [
				E('strong', _('Device')),
				(this.allowany || this.allowlocal)
					? ' (%s)'.format(this.alias != 'dest' ? _('output') : _('input')) : ''
			]);
		}
		else if (!this.multiple && (this.rmempty || this.optional)) {
			choices[''] = E('span', {
				'class': 'zonebadge',
				'style': 'background-color:' + firewall.getColorForName(null)
			}, E('em', _('unspecified')));
		}

		if (this.allowany) {
			choices['*'] = E('span', {
				'class': 'zonebadge',
				'style': 'background-color:' + firewall.getColorForName(null)
			}, [
				E('strong', _('Any zone')),
				(this.allowany && this.allowlocal) ? ' (%s)'.format(_('forward')) : ''
			]);
		}

		for (var i = 0; i < this.zones.length; i++) {
			var zone = this.zones[i],
			    name = zone.getName(),
			    networks = zone.getNetworks(),
			    ifaces = [];

			if (!this.filter(section_id, name))
				continue;

			for (var j = 0; j < networks.length; j++) {
				var network = this.lookupNetwork(networks[j]);

				if (!network)
					continue;

				var span = E('span', {
					'class': 'ifacebadge' + (network.getName() == this.network ? ' ifacebadge-active' : '')
				}, network.getName() + ': ');

				var devices = network.isBridge() ? network.getDevices() : L.toArray(network.getDevice());

				for (var k = 0; k < devices.length; k++) {
					span.appendChild(E('img', {
						'title': devices[k].getI18n(),
						'src': L.resource('icons/%s%s.png'.format(devices[k].getType(), devices[k].isUp() ? '' : '_disabled'))
					}));
				}

				if (!devices.length)
					span.appendChild(E('em', _('(empty)')));

				ifaces.push(span);
			}

			if (!ifaces.length)
				ifaces.push(E('em', _('(empty)')));

			choices[name] = E('span', {
				'class': 'zonebadge',
				'style': 'background-color:' + zone.getColor()
			}, [ E('strong', name) ].concat(ifaces));
		}

		var widget = new ui.Dropdown(values, choices, {
			id: this.cbid(section_id),
			sort: true,
			multiple: this.multiple,
			optional: this.optional || this.rmempty,
			select_placeholder: E('em', _('unspecified')),
			display_items: this.display_size || this.size || 3,
			dropdown_items: this.dropdown_size || this.size || 5,
			validate: L.bind(this.validate, this, section_id),
			create: !this.nocreate,
			create_markup: '' +
				'<li data-value="{{value}}">' +
					'<span class="zonebadge" style="background:repeating-linear-gradient(45deg,rgba(204,204,204,0.5),rgba(204,204,204,0.5) 5px,rgba(255,255,255,0.5) 5px,rgba(255,255,255,0.5) 10px)">' +
						'<strong>{{value}}:</strong> <em>('+_('create')+')</em>' +
					'</span>' +
				'</li>'
		});

		return widget.render();
	},
});

var CBIZoneForwards = form.DummyValue.extend({
	__name__: 'CBI.ZoneForwards',

	load: function(section_id) {
		return Promise.all([ firewall.getDefaults(), firewall.getZones(), network.getNetworks() ]).then(L.bind(function(dzn) {
			this.defaults = dzn[0];
			this.zones = dzn[1];
			this.networks = dzn[2];

			return this.super('load', section_id);
		}, this));
	},

	renderZone: function(zone) {
		var name = zone.getName(),
		    networks = zone.getNetworks(),
		    ifaces = [];

		for (var j = 0; j < networks.length; j++) {
			var network = this.networks.filter(function(net) { return net.getName() == networks[j] })[0];

			if (!network)
				continue;

			var span = E('span', {
				'class': 'ifacebadge' + (network.getName() == this.network ? ' ifacebadge-active' : '')
			}, network.getName() + ': ');

			var devices = network.isBridge() ? network.getDevices() : L.toArray(network.getDevice());

			for (var k = 0; k < devices.length && devices[k]; k++) {
				span.appendChild(E('img', {
					'title': devices[k].getI18n(),
					'src': L.resource('icons/%s%s.png'.format(devices[k].getType(), devices[k].isUp() ? '' : '_disabled'))
				}));
			}

			if (!devices.length)
				span.appendChild(E('em', _('(empty)')));

			ifaces.push(span);
		}

		if (!ifaces.length)
			ifaces.push(E('span', { 'class': 'ifacebadge' }, E('em', _('(empty)'))));

		return E('label', {
			'class': 'zonebadge cbi-tooltip-container',
			'style': 'background-color:' + zone.getColor()
		}, [
			E('strong', name),
			E('div', { 'class': 'cbi-tooltip' }, ifaces)
		]);
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		var value = (cfgvalue != null) ? cfgvalue : this.default,
		    zone = this.zones.filter(function(z) { return z.getName() == value })[0];

		if (!zone)
			return E([]);

		var forwards = zone.getForwardingsBy('src'),
		    dzones = [];

		for (var i = 0; i < forwards.length; i++) {
			var dzone = forwards[i].getDestinationZone();

			if (!dzone)
				continue;

			dzones.push(this.renderZone(dzone));
		}

		if (!dzones.length)
			dzones.push(E('label', { 'class': 'zonebadge zonebadge-empty' },
				E('strong', this.defaults.getForward())));

		return E('div', { 'class': 'zone-forwards' }, [
			E('div', { 'class': 'zone-src' }, this.renderZone(zone)),
			E('span', '⇒'),
			E('div', { 'class': 'zone-dest' }, dzones)
		]);
	},
});

var CBINetworkSelect = form.ListValue.extend({
	__name__: 'CBI.NetworkSelect',

	load: function(section_id) {
		return network.getNetworks().then(L.bind(function(networks) {
			this.networks = networks;

			return this.super('load', section_id);
		}, this));
	},

	filter: function(section_id, value) {
		return true;
	},

	renderIfaceBadge: function(network) {
		var span = E('span', { 'class': 'ifacebadge' }, network.getName() + ': '),
		    devices = network.isBridge() ? network.getDevices() : L.toArray(network.getDevice());

		for (var j = 0; j < devices.length && devices[j]; j++) {
			span.appendChild(E('img', {
				'title': devices[j].getI18n(),
				'src': L.resource('icons/%s%s.png'.format(devices[j].getType(), devices[j].isUp() ? '' : '_disabled'))
			}));
		}

		if (!devices.length) {
			span.appendChild(E('em', { 'class': 'hide-close' }, _('(no interfaces attached)')));
			span.appendChild(E('em', { 'class': 'hide-open' }, '-'));
		}

		return span;
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		var values = L.toArray((cfgvalue != null) ? cfgvalue : this.default),
		    choices = {},
		    checked = {};

		for (var i = 0; i < values.length; i++)
			checked[values[i]] = true;

		values = [];

		if (!this.multiple && (this.rmempty || this.optional))
			choices[''] = E('em', _('unspecified'));

		for (var i = 0; i < this.networks.length; i++) {
			var network = this.networks[i],
			    name = network.getName();

			if (name == 'loopback' || !this.filter(section_id, name))
				continue;

			if (this.novirtual && network.isVirtual())
				continue;

			if (checked[name])
				values.push(name);

			choices[name] = this.renderIfaceBadge(network);
		}

		var widget = new ui.Dropdown(this.multiple ? values : values[0], choices, {
			id: this.cbid(section_id),
			sort: true,
			multiple: this.multiple,
			optional: this.optional || this.rmempty,
			select_placeholder: E('em', _('unspecified')),
			display_items: this.display_size || this.size || 3,
			dropdown_items: this.dropdown_size || this.size || 5,
			validate: L.bind(this.validate, this, section_id),
			create: !this.nocreate,
			create_markup: '' +
				'<li data-value="{{value}}">' +
					'<span class="ifacebadge" style="background:repeating-linear-gradient(45deg,rgba(204,204,204,0.5),rgba(204,204,204,0.5) 5px,rgba(255,255,255,0.5) 5px,rgba(255,255,255,0.5) 10px)">' +
						'{{value}}: <em>('+_('create')+')</em>' +
					'</span>' +
				'</li>'
		});

		return widget.render();
	},

	textvalue: function(section_id) {
		var cfgvalue = this.cfgvalue(section_id),
		    values = L.toArray((cfgvalue != null) ? cfgvalue : this.default),
		    rv = E([]);

		for (var i = 0; i < (this.networks || []).length; i++) {
			var network = this.networks[i],
			    name = network.getName();

			if (values.indexOf(name) == -1)
				continue;

			if (rv.length)
				L.dom.append(rv, ' ');

			L.dom.append(rv, this.renderIfaceBadge(network));
		}

		if (!rv.firstChild)
			rv.appendChild(E('em', _('unspecified')));

		return rv;
	},
});


return L.Class.extend({
	ZoneSelect: CBIZoneSelect,
	ZoneForwards: CBIZoneForwards,
	NetworkSelect: CBINetworkSelect
});
