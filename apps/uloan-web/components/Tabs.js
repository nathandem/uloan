import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import Lend from './Lend';
import Borrow from './Borrow';

export default ({ account, contracts, setContracts, user, setUser }) => (
  <Tabs>
    <TabList>
      <Tab>Lend</Tab>
      <Tab>Borrow</Tab>
    </TabList>

    <TabPanel>
      <Lend account={account} contracts={contracts} setContracts={setContracts} user={user} setUser={setUser}  />
    </TabPanel>
    <TabPanel>
      <Borrow account={account} contracts={contracts} setContracts={setContracts} user={user} setUser={setUser}  />
    </TabPanel>
  </Tabs>
);
