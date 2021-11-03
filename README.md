## Principles
- Less is more, because code is liability. In pratice, avoid bloated scaffolding, convoluted code or patterns encouraging indirection.
- Explicit is better than implicit.

## Structure
- For convenience, to avoid having to commit into multiple repositories, the project is a mono-repo containing multiple applications: the smart contract, the website (frontend) and the backend services.
- Though it's a monorepo, the applications should stay independant, in other words coupling should be avoided as much as possible to avoid cross-dependencies.
- However, an exemption to this decoupling principle exists for the ABIs of the smart contract that both our frontend and our backend services must know about in order to interact with the contract. The least inelegant way found to take this into account while not adding binding/dependency between the applications is to use an external script whose role is to copy the new ABIs from the smart-contract to the relevant folders of the website and backend applications.

### References
https://devopsonwindows.com/code-liability/ \
https://www.python.org/dev/peps/pep-0020/ \
https://nalexn.github.io/separation-of-concerns/
