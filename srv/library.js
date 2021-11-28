module.exports = {
        getSubscriptions: getSubscriptions
        ,            createRoute: createRoute,
    deleteRoute: deleteRoute
        ,            createSMInstance: createSMInstance,
    getSMInstance: getSMInstance,
    deleteSMInstance: deleteSMInstance
    ,            getDestination: getDestination
        };

const cfenv = require('cfenv');
const appEnv = cfenv.getAppEnv();

const axios = require('axios');
const qs = require('qs');

async function getSubscriptions(registry) {
    try {
        // get access token
        let options = {
            method: 'POST',
            url: registry.url + '/oauth/token?grant_type=client_credentials&response_type=token',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(registry.clientid + ':' + registry.clientsecret).toString('base64')
            }
        };
        let res = await axios(options);
        try {
            // get subscriptions
            let options1 = {
                method: 'GET',
                url: registry.saas_registry_url + '/saas-manager/v1/application/subscriptions',
                headers: {
                    'Authorization': 'Bearer ' + res.data.access_token
                }
            };
            let res1 = await axios(options1);
            return res1.data;
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function getCFInfo(appname) {
    try {
        // get authentication url
        let options = {
            method: 'GET',
            url: appEnv.app.cf_api + '/info'
        };
        let res = await axios(options);
        try {
            // get access token
            let options1 = {
                method: 'POST',
                url: res.data.authorization_endpoint + '/oauth/token?grant_type=password',
                data: qs.stringify({
                    username: process.env.cf_api_user,
                    password: process.env.cf_api_password
                }),
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('cf:').toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };
            let res1 = await axios(options1);
            try {
                // get app guid
                let options2 = {
                    method: 'GET',
                    url: appEnv.app.cf_api + '/v3/apps?organization_guids=' + appEnv.app.organization_id + '&space_guids=' + appEnv.app.space_id + '&names=' + appname,
                    headers: {
                        'Authorization': 'Bearer ' + res1.data.access_token
                    }
                };
                let res2 = await axios(options2);
                try {
                    // get domain guid
                    let options3 = {
                        method: 'GET',
                        url: appEnv.app.cf_api + '/v3/domains?names=' + /\.(.*)/gm.exec(appEnv.app.application_uris[0])[1],
                        headers: {
                            'Authorization': 'Bearer ' + res1.data.access_token
                        }
                    };
                    let res3 = await axios(options3);
                    let results = {
                        'access_token': res1.data.access_token,
                        'app_id': res2.data.resources[0].guid,
                        'domain_id': res3.data.resources[0].guid
                    };
                    return results;
                } catch (err) {
                    console.log(err.stack);
                    return err.message;
                }
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function createRoute(tenantHost, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // create route
                let options = {
                    method: 'POST',
                    url: appEnv.app.cf_api + '/v3/routes',
                    data: {
                        'host': tenantHost,
                        'relationships': {
                            'space': {
                                'data': {
                                    'guid': appEnv.app.space_id
                                }
                            },
                            'domain': {
                                'data': {
                                    'guid': CFInfo.domain_id
                                }
                            }
                        }
                    },
                    headers: {
                        'Authorization': 'Bearer ' + CFInfo.access_token,
                        'Content-Type': 'application/json'
                    }
                };
                let res = await axios(options);
                try {
                    // map route to app
                    let options2 = {
                        method: 'POST',
                        url: appEnv.app.cf_api + '/v3/routes/' + res.data.guid + '/destinations',
                        data: {
                            'destinations': [{
                                'app': {
                                    'guid': CFInfo.app_id
                                }
                            }]
                        },
                        headers: {
                            'Authorization': 'Bearer ' + CFInfo.access_token,
                            'Content-Type': 'application/json'
                        }
                    };
                    let res2 = await axios(options2);
                    console.log('Route created for ' + tenantHost);
                    return res2.data;
                } catch (err) {
                    console.log(err.stack);
                    return err.message;
                }
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        },
        function (err) {
            console.log(err.stack);
            return err.message;
        });
};

async function deleteRoute(tenantHost, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // get route id
                let options = {
                    method: 'GET',
                    url: appEnv.app.cf_api + '/v3/apps/' + CFInfo.app_id + '/routes?hosts=' + tenantHost,
                    headers: {
                        'Authorization': 'Bearer ' + CFInfo.access_token
                    }
                };
                let res = await axios(options);
                if (res.data.pagination.total_results === 1) {
                    try {
                        // delete route
                        let options2 = {
                            method: 'DELETE',
                            url: appEnv.app.cf_api + '/v3/routes/' + res.data.resources[0].guid,
                            headers: {
                                'Authorization': 'Bearer ' + CFInfo.access_token
                            }
                        };
                        let res2 = await axios(options2);
                        console.log('Route deleted for ' + tenantHost);
                        return res2.data;
                    } catch (err) {
                        console.log(err.stack);
                        return err.message;
                    }
                } else {
                    let errmsg = { 'error': 'Route not found' };
                    console.log(errmsg);
                    return errmsg;
                }
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        },
        function (err) {
            console.log(err.stack);
            return err.message;
        });
};

async function createSMInstance(sm, tenantId) {
    try {
        // get access token
        let options = {
            method: 'POST',
            url: sm.url + '/oauth/token?grant_type=client_credentials&response_type=token',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(sm.clientid + ':' + sm.clientsecret).toString('base64')
            }
        };
        let res = await axios(options);
        try {
            // get service offering id
            let options1 = {
                method: 'GET',
                url: sm.sm_url + "/v1/service_offerings?fieldQuery=catalog_name eq 'hana'",
                headers: {
                    'Authorization': 'Bearer ' + res.data.access_token
                }
            };
            let res1 = await axios(options1);
            if (res1.data.num_items === 1) {
                try {
                    // get service plan id
                    let options2 = {
                        method: 'GET',
                        url: sm.sm_url + "/v1/service_plans?fieldQuery=catalog_name eq 'hdi-shared' and service_offering_id eq '" + res1.data.items[0].id + "'",
                        headers: {
                            'Authorization': 'Bearer ' + res.data.access_token
                        }
                    };
                    let res2 = await axios(options2);
                    if (res2.data.num_items === 1) {
                        try {
                            // create service instance
                            let options3 = {
                                method: 'POST',
                                url: sm.sm_url + '/v1/service_instances?async=false',
                                data: {
                                    'name': tenantId,
                                    'service_plan_id': res2.data.items[0].id
                                },
                                headers: {
                                    'Authorization': 'Bearer ' + res.data.access_token
                                }
                            };
                            let res3 = await axios(options3);
                            try {
                                // create service binding
                                let options4 = {
                                    method: 'POST',
                                    url: sm.sm_url + '/v1/service_bindings?async=false',
                                    data: {
                                        'name': tenantId,
                                        'service_instance_id': res3.data.id
                                    },
                                    headers: {
                                        'Authorization': 'Bearer ' + res.data.access_token
                                    }
                                };
                                let res4 = await axios(options4);
                                if (res4.data.hasOwnProperty('id') && res4.data.hasOwnProperty('credentials')) {
                                    let payload = { 'id': res4.data.id, 'credentials': res4.data.credentials, 'status': 'CREATION_SUCCEEDED' };
                                    try {
                                        // deploy DB artefacts
                                        let options5 = {
                                            method: 'POST',
                                            data: payload,
                                            url: process.env.db_api_url + '/v1/deploy/to/instance',
                                            headers: {
                                                'Authorization': 'Basic ' + Buffer.from(process.env.db_api_user + ':' + process.env.db_api_password).toString('base64'),
                                                'Content-Type': 'application/json'
                                            }
                                        };
                                        let res5 = await axios(options5);
                                        return res5.data;
                                    } catch (err) {
                                        console.log(err.stack);
                                        return err.message;
                                    }
                                } else {
                                    let errmsg = { 'error': 'Invalid service binding' };
                                    console.log(errmsg, res4);
                                    return errmsg;
                                }
                            } catch (err) {
                                console.log(err.stack);
                                return err.message;
                            }
                        } catch (err) {
                            console.log(err.stack);
                            return err.message;
                        }
                    } else {
                        let errmsg = { 'error': 'Service plan hdi-shared not found' };
                        console.log(errmsg);
                        return errmsg;
                    }
                } catch (err) {
                    console.log(err.stack);
                    return err.message;
                }
            } else {
                let errmsg = { 'error': 'Service offering hana not found' };
                console.log(errmsg);
                return errmsg;
            }
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function getSMInstance(sm, tenantId) {
    try {
        // get access token
        let options = {
            method: 'POST',
            url: sm.url + '/oauth/token?grant_type=client_credentials&response_type=token',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(sm.clientid + ':' + sm.clientsecret).toString('base64')
            }
        };
        let res = await axios(options);
        try {
            // get service binding details
            let options1 = {
                method: 'GET',
                url: sm.sm_url + "/v1/service_bindings?fieldQuery=name eq '" + tenantId + "'",
                headers: {
                    'Authorization': 'Bearer ' + res.data.access_token
                }
            };
            let res1 = await axios(options1);
            if (res1.data.num_items === 1) {
                return res1.data.items[0];
            } else {
                let errmsg = { 'error': 'Service binding not found for tenant ' + tenantId };
                console.log(errmsg);
                return errmsg;
            }
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function deleteSMInstance(sm, tenantId) {
    try {
        // get access token
        let options = {
            method: 'POST',
            url: sm.url + '/oauth/token?grant_type=client_credentials&response_type=token',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(sm.clientid + ':' + sm.clientsecret).toString('base64')
            }
        };
        let res = await axios(options);
        try {
            // get service binding and service instance ids
            let options1 = {
                method: 'GET',
                url: sm.sm_url + "/v1/service_bindings?fieldQuery=name eq '" + tenantId + "'",
                headers: {
                    'Authorization': 'Bearer ' + res.data.access_token
                }
            };
            let res1 = await axios(options1);
            if (res1.data.num_items === 1) {
                try {
                    // delete service binding
                    let options2 = {
                        method: 'DELETE',
                        url: sm.sm_url + '/v1/service_bindings/' + res1.data.items[0].id,
                        headers: {
                            'Authorization': 'Bearer ' + res.data.access_token
                        }
                    };
                    let res2 = await axios(options2);
                    try {
                        // delete service instance
                        let options3 = {
                            method: 'DELETE',
                            url: sm.sm_url + '/v1/service_instances/' + res1.data.items[0].service_instance_id,
                            headers: {
                                'Authorization': 'Bearer ' + res.data.access_token
                            }
                        };
                        let res3 = await axios(options3);
                        return res3.data;
                    } catch (err) {
                        console.log(err.stack);
                        return err.message;
                    }
                } catch (err) {
                    console.log(err.stack);
                    return err.message;
                }
            } else {
                let errmsg = { 'error': 'Service binding not found for tenant ' + tenantId };
                console.log(errmsg);
                return errmsg;
            }
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function getDestination(dest, subdomain, destination) {
    try {
        // use tenant subdomain to authenticate
        let url = dest.url.split('://')[0] + '://' + subdomain + dest.url.slice(dest.url.indexOf('.'));
        try {
            let options1 = {
                method: 'POST',
                url: url + '/oauth/token?grant_type=client_credentials',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(dest.clientid + ':' + dest.clientsecret).toString('base64')
                }
            };
            let res1 = await axios(options1);
            try {
                options2 = {
                    method: 'GET',
                    url: dest.uri + '/destination-configuration/v1/destinations/' + destination,
                    headers: {
                        Authorization: 'Bearer ' + res1.data.access_token
                    }
                };
                let res2 = await axios(options2);
                return res2.data.destinationConfiguration;
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        } catch (err) {
            console.log(err.stack);
            return err.message;
        }
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};
