cabox-redis-master-slave
[![Circle CI](https://circleci.com/gh/creativelive/catbox-redis-master-slave.png?style=badge)](https://circleci.com/gh/creativelive/catbox-redis-master-slave)
========================

redis engine for catbox that handles the master-slave replication

### Options

```
{
  write: {
    host: 127.0.0.1,
    port: 6379
  },
  read: {
    host: 127.0.0.1,
    port: 6379
  },
  password: 'password',
  partition: 'www'
}
```
- `host` - the Redis server hostname. Defaults to `'127.0.0.1'`.
- `port` - the Redis server port or unix domain socket path. Defaults to `6379`.
- `password` - the Redis authentication password when required.
- `partition` - this will store items under keys that start with this value. (Default: '')
