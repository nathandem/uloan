## Principles
- Less is more, because code is liability. In pratice, avoid bloated scaffolding, convoluted code or patterns encouraging indirection.
- Explicit is better than implicit.

## Structure
- For convenience, to avoid having to commit into multiple repositories, the project is a mono-repo containing 3 applications: the smart contract, the website (frontend) and the backend.
- Though it's a monorepo, the applications should stay independant, in other words coupling should be avoided as much as possible to avoid cross-dependencies.
- However, an exemption to this decoupling principle exists for the ABIs of the smart contract that both our frontend and our backend must know about in order to interact with the contract. The least inelegant way found to take this into account while not adding binding/dependency between the applications is to use an external script whose role is to copy the new ABIs from the smart-contract to the relevant folders of the website and backend applications.
- To make sure we don't forget to call this script during development, we rely on yarn workspaces to call this script everytime the smart contract is re-compiled. It's not perfect in that it introduces some shared dependency on yarn because yarn centrally manages the packages, but it's still a decent option. To benefit from this integration, it is recommended to call the applications's script from the top level package.json, e.g. `yarn run contract:compile`.

## Dependencies
- This project uses yarn berry as the project manager. Yarn berry refers to all the versions above yarn 1. If you don't have it install locally, do that right after cloning the project. Instructions here: https://yarnpkg.com/getting-started/install


### References
https://devopsonwindows.com/code-liability/ \
https://www.python.org/dev/peps/pep-0020/ \
https://nalexn.github.io/separation-of-concerns/
