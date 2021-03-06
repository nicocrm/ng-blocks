(function () {
  'use strict';

  // Interface with sdata job service.
  angular.module('blocks.sdata')
    .service('sdataJobService', SdataJobService);

  // service declaration
  function SdataJobService(sdataService) {

    var schedulingUrl = '/$app/scheduling/-/';

    /**
     * Trigger a job to be executed immediately.
     *
     * @param {string} jobId   Job definition id, e.g. 'Saleslogix.Reporting.Jobs.CrystalReportsJob'
     * @param {string} [descriptor]  Job descriptor, will default to job id
     * @param {object} [params]   Object defining all parameters
     * @promises {string} trigger Id
     */
    this.triggerJob = function triggerJob(jobId, descriptor, params) {
      var payload = {
        $descriptor: descriptor || jobId,
        job: {
          $key: jobId
        },
        parameters: []
      };
      if (params) {
        for (var k in params) {
          if (params.hasOwnProperty(k)) {
            payload.parameters.push({
              Name: k,
              Value: params[k]
            });
          }
        }
      }
      var url = schedulingUrl + 'triggers?format=json';
      return sdataService.executeRequest(url, 'POST', payload).then(function (data) {
        return data.$key;
      });
    }

    /**
     * Retrieve execution status for a trigger.
     *
     * @param {string} triggerId  id returned from the triggerJob call
     * @promises {object} execution status, or null if not found
     */
    this.getExecutionStatus = function getExecutionStatus(triggerId) {
      var url = schedulingUrl + 'executions(triggerId eq \'' + encodeURIComponent(triggerId) + '\')?format=json';
      return sdataService.executeRequest(url, 'GET');
    }
  }
})();
