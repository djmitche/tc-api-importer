# TC-API-Importer

This is a [very
temporary](https://github.com/taskcluster/taskcluster/issues/2523) tool to
import resources from one Taskcluster deployment into another, using the API
instead of the backend data storage.

This focuses on the data types that are signed and encrypted, as those cannot
be imported via backend data-storage copies in the absence of the signing and
encryption keys.

## Usage

Give the source rootUrl and credentials on the destination deployment

```shell
export SRC_ROOT_URL= ..
export TASKCLUSTER_ROOT_URL= ..
export TASKCLUSTER_CLIENT_ID= ..
export TASKCLUSTER_ACCESS_TOKEN= ..
```

then

```shell
yarn run import
```
