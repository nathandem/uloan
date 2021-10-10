import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import Lend from './Lend';
<<<<<<< HEAD
import Borrow from './Borrow';
=======
>>>>>>> web

export default ({ account }) => (
  <Tabs>
    <TabList>
      <Tab>Lend</Tab>
      <Tab>Borrow</Tab>
    </TabList>

    <TabPanel>
      <Lend account={account} />
    </TabPanel>
<<<<<<< HEAD
    <TabPanel>
      <Borrow account={account} />
    </TabPanel>
=======
    <TabPanel>{/* <Borrow /> */}</TabPanel>
>>>>>>> web
  </Tabs>
);
