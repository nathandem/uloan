import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import Lend from './Lend';
import Borrow from './Borrow';

export default ({ account }) => (
  <Tabs>
    <TabList>
      <Tab>Lend</Tab>
      <Tab>Borrow</Tab>
    </TabList>

    <TabPanel>
      <Lend account={account} />
    </TabPanel>
    <TabPanel>
      <Borrow account={account} />
    </TabPanel>
  </Tabs>
);
