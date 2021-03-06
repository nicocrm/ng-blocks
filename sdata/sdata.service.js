(function () {
  'use strict';

  angular.module('blocks.sdata')
    .provider('sdataService', SdataServiceProvider);

  // provider is used to be able to configure the sdata URI prior to constructing the service
  function SdataServiceProvider() {
    var sdataUri, username, password, preventCaching;

    this.configure = function (config) {
      // root URI for sdata services: e.g. http://vmng-slx81.sssworld-local.com:3012/sdata/
      sdataUri = config.sdataUri;
      username = config.username;
      password = config.password;
      preventCaching = config.preventCaching;
    }

    this.$get = ['$http', '$q', function ($http, $q) {
      if (!sdataUri)
        throw new Error('sdataUri must be configured prior to accessing sdata service');
      if (!/\/$/.test(sdataUri))
        sdataUri += '/';
      if (/slx\/dynamic\/-/.test(sdataUri))
        throw new Error('sdataUri should be to root of sdata site (i.e. /sdata/, not /sdata/slx/dynamic/-/)');

      var service = new SdataService($http, $q, sdataUri, preventCaching);
      if (username) {
        service.setAuthenticationParameters(username, password);
      }
      return service;
    }];
  }

  function SdataService($http, $q, sdataUri, preventCaching) {

    var _username, _password;

    /**
     * this is set when logging in and should be set before interacting with the other methods
     *
     * @param {string} username
     * @param {string} password
     */
    this.setAuthenticationParameters = function setAuthenticationParameters(username, password) {
      _username = username;
      _password = password;
    };

    /**
     * Read resource feed
     *
     * @param {string} resourceKind
     * @param {string} where
     * @param {object} [queryArgs]
     * @returns {*}
     */
    this.read = function read(resourceKind, where, queryArgs) {
      // summary:
      //  Retrieve SData resources matching the specified criteria
      //

      var url = 'slx/dynamic/-/' + resourceKind + '?format=json';
      if (where) {
        // this must be encoded explicitly because Angular will encode a space to a + (conforming to RFC)
        // which sdata cannot parse
        url += '&where=' + encodeURIComponent(where);
      }
      if (queryArgs) {
        for (var k in queryArgs) {
          if (queryArgs.hasOwnProperty(k))
            url += '&' + k + '=' + encodeURIComponent(queryArgs[k]);
        }
      }

      return this.executeRequest(url);
      //url = sdataUri + url;
      //var req = getRequestConfig();
      //return $http.get(url, req).then(function(response) {
      //    console.log('GET returned', response);
      //    return response.data;
      //}, function(err) {
      //    console.warn('ERROR occured', err);
      //});
    }

    /**
     * Create a resource
     *
     * @param {string} resourceKind
     * @param {object} data
     * @returns {object} created object (including new $key property)
     */
    this.create = function create(resourceKind, data) {
      // summary:
      //  Create resource
      var url = 'slx/dynamic/-/' + resourceKind + '?format=json';
      return this.executeRequest(url, 'POST', data);
    }

    /**
     * Update a single resource
     *
     * @param {string} resourceKind
     * @param {object} data
     * @returns {*}
     */
    this.update = function update(resourceKind, data) {
      // summary:
      //  Update designated resource.  The id ($key) must be provided as part of the data.
      var url = 'slx/dynamic/-/' + resourceKind + '("' + data.$key + '")?format=json';
      return this.executeRequest(url, 'PUT', data);
    }

    /**
     * Delete a resource (we use del instead of delete to make javascript linter happy)
     *
     * @param {string} resourceKind
     * @param {string} key
     * @promises  {*}  Will resolve when delete is complete, but no value is returned
     */
    this['delete'] = this.del = function del(resourceKind, key) {
      // summary:
      //  delete designated resource.
      var url = 'slx/dynamic/-/' + resourceKind + '("' + key + '")?format=json';
      return this.executeRequest(url, 'DELETE');
    }

    /**
     * Retrieve the configured sdata URI (root of the sdata site, ending in /sdata/)
     */
    this.getSdataUri = function getSdataUri() {
      return sdataUri;
    }

    /**
     *
     * @param {string} resourceKind
     * @param {string} operationName
     * @param {string} recordId
     * @param {object} [parameters]  Any additional parameters to be added to the request - names must match the
     * ones declared in AA
     * @promises {*} Business rule's response, or undefined if no response is returned
     */
    this.callBusinessRule = function callBusinessRule(resourceKind, operationName, recordId, parameters) {
      var payload = {
        $name: operationName,
        request: {
          entity: {$key: recordId}
        }
      };
      if (parameters) {
        angular.extend(payload.request, parameters);
      }
      var url = 'slx/dynamic/-/' + resourceKind + '/$service/' + operationName + '?format=json';
      return this.executeRequest(url, 'POST', payload).then(function (response) {
        if (response.response && response.response.hasOwnProperty('Result'))
          return response.response.Result;
        return undefined;
      });
    }

    /**
     * Generic execute request method.  Used internally and by sub services.
     *
     * @param {string} url    Fragment of url to be added to the root sdata URI
     * @param {string} [method=GET]  HTTP Method to use
     * @param {object} [payload]   Data to be sent with the request
     */
    this.executeRequest = function executeRequest(url, method, payload) {
      var req = _getRequestConfig({
        url: sdataUri + url,
        method: method || 'GET',
        data: payload
      });
      // prevent caching?
      if (preventCaching && req.method == 'GET') {
        req.url += '&rnd=' + Math.random();
      }
      return $http(req).then(function (response) {
        return response.data;
      }, _handleSdataError);
    }

    ///////////////

    function _getRequestConfig(addlConfig) {
      var b = {
        withCredentials: false,
        headers: {
          'Authorization': 'Basic ' + window.btoa(_username + ':' + _password),
          // Cache-Control needs to be set on the server side, not the client!
          // If you have cache problem set that header on the sdata vdir
          //'Cache-Control': 'no-cache',
          // the next 2 headers are there to prevent the 401 challenge from being sent to the browser
          // we want to make sure that our custom error handlers get any authentication failure, not the
          // browser!
          'X-Authorization': 'Basic ' + window.btoa(_username + ':' + _password),
          'X-Authorization-Mode': 'no-challenge'
        }
      };
      if (addlConfig)
        angular.extend(b, addlConfig);
      return b;
    }

    function _handleSdataError(error) {
      if (error.data && error.data.length && error.data[0].message) {
        return $q.reject(error.data[0].message);
      }
      return $q.reject(error.statusText || error);
    }
  }
})();
