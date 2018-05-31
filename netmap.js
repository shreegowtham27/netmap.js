import PromisePool from 'es6-promise-pool'

export default class NetMap {
  constructor ({timeout, protocol} = {}) {
    this.timeout = timeout || 1000
    this.protocol = protocol || 'http'
  }

  pingSweep (hosts, {maxConnections, port} = {}) {
    return new Promise((resolve, reject) => {
      // best estimate for maxConnections based on
      // https://stackoverflow.com/questions/985431/max-parallel-http-connections-in-a-browser
      // which may not be up-to-date or accurate
      port = port || 45000
      maxConnections = maxConnections || (function () {
        if (window.chrome) return 10
        else return 17
      })()

      const results = {
        hosts: []
      }

      this.tcpScan(hosts, [port], {
        maxConnections: maxConnections,
        controlPorts: []
      })
        .then(tcpResults => {
          results.meta = tcpResults.meta

          for (let i in tcpResults.hosts) {
            const result = {
              host: tcpResults.hosts[i].host,
              delta: tcpResults.hosts[i].ports[0].delta,
              live: false
            }

            if (result.delta < this.timeout) {
              result.live = true
            }

            results.hosts.push(result)
          }

          resolve(results)
        })
    })
  }

  tcpScan (hosts, ports, {portCallback, maxConnections, controlPorts} = {}) {
    return new Promise((resolve, reject) => {
      // best estimate for maxConnections based on
      // https://stackoverflow.com/questions/985431/max-parallel-http-connections-in-a-browser
      // which may not be up-to-date or accurate
      maxConnections = maxConnections || 6
      controlPorts = controlPorts || [45000, 45001, 45002]
      ports = ports.concat(controlPorts)
      const results = {
        meta: {
          hosts: hosts,
          ports: ports,
          maxConnections: maxConnections,
          controlPorts: controlPorts,
          startTime: (new Date()).getTime()
        },
        hosts: (function () {
          const hostsResults = []
          hosts.forEach(function (host) {
            hostsResults.push({
              host: host,
              ports: []
            })
          })
          return hostsResults
        })()
      }

      const self = this
      const pool = new PromisePool(function * () {
        for (let i = 0; i < hosts.length; i++) {
          for (let j = 0; j < ports.length; j++) {
            yield self._checkPort(hosts[i], ports[j], {
              timeout: self.timeout,
              protocol: self.protocol
            })
          }
        }
      }, maxConnections)

      pool.addEventListener('fulfilled', (event) => {
        let result = results.hosts.find(function (value) {
          return value.host === event.data.result.host
        })

        result.ports.push({
          port: event.data.result.port,
          delta: event.data.result.delta,
          open: undefined
        })

        if (portCallback) portCallback(event.data.result)
      })

      pool.start().then(() => {
        results.meta.endTime = (new Date()).getTime()
        results.meta.scanDuration = results.meta.endTime - results.meta.startTime
        resolve(results)
      })
    })
  }

  _checkPort (host, port, {timeout, protocol} = {}) {
    return new Promise((resolve, reject) => {
      timeout = timeout || 1000
      protocol = protocol || 'http'
      const start = (new Date()).getTime()
      let interval

      const img = new Image()
      img.src = protocol + '://' + host + ':' + port
      img.onerror = function () {
        let delta = (new Date()).getTime() - start

        if (delta < timeout) {
          clearInterval(interval)
          img.src = ''
          resolve({
            host: host,
            port: port,
            delta: delta
          })
        }
      }
      img.onload = img.onerror

      interval = setInterval(function () {
        var delta = (new Date()).getTime() - start

        if (delta >= timeout) {
          if (!img) return
          img.src = ''
          clearInterval(interval)
          resolve({
            host: host,
            port: port,
            delta: delta
          })
        }
      }, 1)
    })
  }
}
