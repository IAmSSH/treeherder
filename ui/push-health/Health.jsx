import React from 'react';
import PropTypes from 'prop-types';
import { Button, Navbar, Nav, Container, Row, Spinner } from 'reactstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import camelCase from 'lodash/camelCase';
import { Helmet } from 'react-helmet';

import faviconBroken from '../img/push-health-broken.png';
import faviconOk from '../img/push-health-ok.png';
import ErrorMessages from '../shared/ErrorMessages';
import NotificationList from '../shared/NotificationList';
import {
  clearNotificationAtIndex,
  clearExpiredTransientNotifications,
} from '../helpers/notifications';
import PushModel from '../models/push';
import RepositoryModel from '../models/repository';
import StatusProgress from '../shared/StatusProgress';
import { getPercentComplete } from '../helpers/display';
import { scrollToLine } from '../helpers/utils';
import {
  createQueryParams,
  parseQueryParams,
  updateQueryParams,
} from '../helpers/url';
import InputFilter from '../shared/InputFilter';

import { resultColorMap } from './helpers';
import Metric from './Metric';
import Navigation from './Navigation';
import TestMetric from './TestMetric';
import JobListMetric from './JobListMetric';
import CommitHistory from './CommitHistory';

export default class Health extends React.PureComponent {
  constructor(props) {
    super(props);

    const params = new URLSearchParams(props.location.search);

    this.state = {
      user: { isLoggedIn: false },
      revision: params.get('revision'),
      repo: params.get('repo'),
      currentRepo: null,
      metrics: {},
      result: null,
      failureMessage: null,
      notifications: [],
      progressExpanded: true,
      commitHistoryExpanded: true,
      lintingExpanded: false,
      buildsExpanded: false,
      testsExpanded: false,
      showParentMatches: false,
      searchStr: params.get('searchStr') || '',
    };
  }

  async componentDidMount() {
    const { repo } = this.state;
    // Get the test data
    const { metrics } = await this.updatePushHealth();
    // Expand the metric if it is in a failed state, or if it is
    // defaulted to `true` in the state in the constructor.
    const expandedStates = Object.entries(metrics).reduce(
      (acc, [key, metric]) => ({
        ...acc,
        [`${key}Expanded`]:
          metric.result === 'fail' || this.state[`${key}Expanded`],
      }),
      {},
    );
    const repos = await RepositoryModel.getList();
    const currentRepo = repos.find(repoObj => repoObj.name === repo);

    this.setState({ ...expandedStates, currentRepo });

    // Update the tests every two minutes.
    this.testTimerId = setInterval(() => this.updatePushHealth(), 120000);
    this.notificationsId = setInterval(() => {
      const { notifications } = this.state;

      this.setState(clearExpiredTransientNotifications(notifications));
    }, 4000);
  }

  componentWillUnmount() {
    clearInterval(this.testTimerId);
  }

  setUser = user => {
    this.setState({ user });
  };

  updatePushHealth = async () => {
    const { repo, revision } = this.state;
    const { data, failureStatus } = await PushModel.getHealth(repo, revision);
    const newState = !failureStatus ? data : { failureMessage: data };

    this.setState(newState);
    return newState;
  };

  notify = (message, severity, options = {}) => {
    const { notifications } = this.state;
    const notification = {
      ...options,
      message,
      severity: severity || 'darker-info',
      created: Date.now(),
    };
    const newNotifications = [notification, ...notifications];

    this.setState({
      notifications: newNotifications,
    });
  };

  clearNotification = index => {
    const { notifications } = this.state;

    this.setState(clearNotificationAtIndex(notifications, index));
  };

  setExpanded = (metricName, expanded) => {
    const root = camelCase(metricName);
    const key = `${root}Expanded`;
    const { [key]: oldExpanded } = this.state;

    if (oldExpanded !== expanded) {
      this.setState({
        [key]: expanded,
      });
    } else if (expanded) {
      scrollToLine(`#${root}Metric`, 0, 0, {
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  filter = searchStr => {
    const { location, history } = this.props;
    const newParams = { ...parseQueryParams(location.search), searchStr };

    if (!searchStr.length) {
      delete newParams.searchStr;
    }

    const queryString = createQueryParams(newParams);

    updateQueryParams(queryString, history, location);

    this.setState({ searchStr });
  };

  render() {
    const {
      metrics,
      result,
      user,
      repo,
      revision,
      failureMessage,
      notifications,
      status,
      progressExpanded,
      commitHistoryExpanded,
      lintingExpanded,
      buildsExpanded,
      testsExpanded,
      searchStr,
      currentRepo,
      showParentMatches,
    } = this.state;
    const { tests, commitHistory, linting, builds } = metrics;
    const percentComplete = status ? getPercentComplete(status) : 0;
    const progress = {
      name: 'Progress',
      value: `${percentComplete}%`,
      result: percentComplete === 100 ? 'done' : 'in progress',
      details: [],
    };
    const needInvestigationCount = tests
      ? tests.details.needInvestigation.length
      : 0;

    return (
      <React.Fragment>
        <Helmet>
          <link
            rel="shortcut icon"
            href={result === 'fail' ? faviconBroken : faviconOk}
          />
          <title>{`[${needInvestigationCount}] Push Health`}</title>
        </Helmet>
        <Navigation
          user={user}
          setUser={this.setUser}
          notify={this.notify}
          result={result}
          repo={repo}
          revision={revision}
        >
          <Navbar color="light" light expand="sm" className="w-100">
            {!!tests && (
              <Nav className="metric-buttons mb-2 pt-2 pl-3 justify-content-between w-100">
                <span>
                  {[progress, commitHistory, linting, builds, tests].map(
                    metric => (
                      <span key={metric.name}>
                        {!!metric && !!metric.details && (
                          <Button
                            size="sm"
                            className="mr-2"
                            color={resultColorMap[metric.result]}
                            title={`Click to toggle ${
                              metric.name
                            }: ${metric.result.toUpperCase()}`}
                            onClick={() => this.setExpanded(metric.name, true)}
                            key={metric.name}
                          >
                            {metric.name}
                            {['pass', 'fail', 'indeterminate'].includes(
                              metric.result,
                            ) ? (
                              <FontAwesomeIcon
                                className="ml-1"
                                icon={
                                  metric.result === 'pass'
                                    ? faCheckCircle
                                    : faExclamationTriangle
                                }
                              />
                            ) : (
                              <span className="ml-1">{metric.value}</span>
                            )}
                          </Button>
                        )}
                      </span>
                    ),
                  )}
                  <Button
                    size="sm"
                    className="mr-2"
                    title="Not yet implemented.  Coming soon."
                    key="performance"
                    disabled
                    outline
                  >
                    Performance
                  </Button>
                </span>
                <span className="mr-2 d-flex">
                  <Button
                    size="sm"
                    className="text-nowrap mr-1"
                    title="Toggle failures that also failed in the parent"
                    onClick={() =>
                      this.setState({ showParentMatches: !showParentMatches })
                    }
                  >
                    {showParentMatches ? 'Hide' : 'Show'} parent matches
                  </Button>
                  <InputFilter
                    updateFilterText={this.filter}
                    placeholder="filter path or platform"
                  />
                </span>
              </Nav>
            )}
          </Navbar>
        </Navigation>
        <Container fluid className="mt-2 mb-5">
          <NotificationList
            notifications={notifications}
            clearNotification={this.clearNotification}
          />
          {!!tests && !!currentRepo && (
            <div className="d-flex flex-column">
              <Row className="w-100">
                <Metric
                  name="Progress"
                  result=""
                  expanded={progressExpanded}
                  setExpanded={this.setExpanded}
                >
                  <div>
                    <div>{percentComplete}% Complete</div>
                    <StatusProgress counts={status} />
                  </div>
                </Metric>
              </Row>
              {commitHistory.details && (
                <Row className="w-100">
                  <Metric
                    name="Commit History"
                    result=""
                    expanded={commitHistoryExpanded}
                    setExpanded={this.setExpanded}
                  >
                    <CommitHistory
                      history={commitHistory.details}
                      revision={revision}
                      currentRepo={currentRepo}
                      compareWithParent={this.compareWithParent}
                    />
                  </Metric>
                </Row>
              )}
              <Row>
                <JobListMetric
                  data={linting}
                  repo={repo}
                  revision={revision}
                  expanded={lintingExpanded}
                  setExpanded={this.setExpanded}
                  showParentMatches={showParentMatches}
                />
              </Row>
              <Row>
                <JobListMetric
                  data={builds}
                  repo={repo}
                  revision={revision}
                  expanded={buildsExpanded}
                  setExpanded={this.setExpanded}
                  showParentMatches={showParentMatches}
                />
              </Row>
              <Row>
                <TestMetric
                  data={tests}
                  repo={repo}
                  currentRepo={currentRepo}
                  revision={revision}
                  user={user}
                  notify={this.notify}
                  expanded={testsExpanded}
                  setExpanded={this.setExpanded}
                  searchStr={searchStr}
                  showParentMatches={showParentMatches}
                />
              </Row>
            </div>
          )}
          {failureMessage && <ErrorMessages failureMessage={failureMessage} />}
          {!failureMessage && !tests && (
            <h4>
              <Spinner />
              <span className="ml-2 pb-1">
                Gathering health data and comparing with parent push...
              </span>
            </h4>
          )}
        </Container>
      </React.Fragment>
    );
  }
}

Health.propTypes = {
  location: PropTypes.object.isRequired,
};
