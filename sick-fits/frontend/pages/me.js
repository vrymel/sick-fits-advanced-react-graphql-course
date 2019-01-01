import React from "react";
import { Query } from "react-apollo";
import gql from "graphql-tag";

const GET_ME = gql`
  query GET_ME {
    me {
      id
      email
      name
    }
  }
`;

const MePage = props => (
  <Query query={GET_ME}>
    {(data, loading, error) => {
      console.log(data);
      return <div>Hello!</div>;
    }}
  </Query>
);

export default MePage;
